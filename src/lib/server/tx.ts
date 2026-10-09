import "server-only";
import bs58 from "bs58";
import {
  ComputeBudgetProgram,
  PublicKey,
  SendTransactionError,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { bad } from "./http";
import { connection, recentBlockhash } from "./solana";

export const PRIORITY_MICROLAMPORTS = 200_000;

export async function buildTx(payer: PublicKey, instructions: TransactionInstruction[], computeUnits: number): Promise<VersionedTransaction> {
  const { blockhash } = await recentBlockhash();
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS }),
      ...instructions,
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  if (tx.serialize().length > 1232) bad("Transaction too large");
  return tx;
}

export const toBase64 = (tx: VersionedTransaction) => Buffer.from(tx.serialize()).toString("base64");

export function parseSigned(b64: unknown): VersionedTransaction {
  if (typeof b64 !== "string" || b64.length > 3000) return bad("Missing signed transaction");
  try {
    return VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
  } catch {
    return bad("Malformed transaction");
  }
}

/** Account keys of the transaction (static keys only: we never build with lookup tables). */
export const accountKeys = (tx: VersionedTransaction) => tx.message.staticAccountKeys.map((k) => k.toBase58());

export const feePayer = (tx: VersionedTransaction) => tx.message.staticAccountKeys[0]?.toBase58();

/** True when an instruction of `programId` references `account`. */
export function touches(tx: VersionedTransaction, programId: PublicKey, account?: string): boolean {
  const keys = accountKeys(tx);
  return tx.message.compiledInstructions.some(
    (ix) => keys[ix.programIdIndex] === programId.toBase58() && (!account || ix.accountKeyIndexes.some((i) => keys[i] === account)),
  );
}

function allSigned(tx: VersionedTransaction): boolean {
  const required = tx.message.header.numRequiredSignatures;
  return tx.signatures.slice(0, required).every((s) => s.some((b) => b !== 0));
}

/** Readable reason from a failed simulation / send. */
function sendError(err: unknown): string {
  const logs = err instanceof SendTransactionError ? (err.logs ?? []) : [];
  const text = `${err instanceof Error ? err.message : String(err)} ${logs.join(" ")}`;
  if (/insufficient (funds|lamports)|0x1\b/i.test(text)) return "Not enough SOL in your wallet for this transaction.";
  if (/blockhash not found|block height exceeded/i.test(text)) return "The transaction expired before it was sent. Try again.";
  if (/already (been )?processed/i.test(text)) return "already-processed";
  if (/already in use/i.test(text)) return "That mint address already exists on chain.";
  console.warn("send failed:", text.slice(0, 600));
  return "The network rejected the transaction. Try again.";
}

/**
 * Sends a fully signed transaction and waits for confirmation. Returns the
 * signature with confirmed=false if it hasn't landed within `waitMs`; the
 * caller can poll by signature.
 */
export async function sendAndConfirm(tx: VersionedTransaction, waitMs = 45_000): Promise<{ signature: string; confirmed: boolean }> {
  if (!allSigned(tx)) bad("The transaction is missing a signature");
  const raw = tx.serialize();
  let signature: string;
  try {
    signature = await connection().sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 0 });
  } catch (err) {
    const reason = sendError(err);
    if (reason !== "already-processed") bad(reason);
    signature = bs58.encode(tx.signatures[0]);
  }
  // Rebroadcast every 2s until confirmed or the wait runs out (the blockhash outlives it).
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const { value } = await connection().getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) bad(`The transaction failed on chain: ${JSON.stringify(status.err)}`);
    if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) return { signature, confirmed: true };
    await new Promise((r) => setTimeout(r, 2_000));
    connection()
      .sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 })
      .catch(() => {});
  }
  return { signature, confirmed: false };
}

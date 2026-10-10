import "server-only";
import { PUMP_PROGRAM_ID, PUMP_SDK, bondingCurvePda } from "@pump-fun/pump-sdk";
import { TOKEN_2022_PROGRAM_ID, getTokenMetadata } from "@solana/spl-token";
import { PublicKey, type VersionedTransactionResponse } from "@solana/web3.js";
import type { LaunchRow } from "./db";
import { env } from "./env";
import { connection } from "./solana";

export type ChainCheck = { ok: true; signature: string; devTokens: number } | { ok: false; final: boolean; reason: string };

/**
 * What landed on chain must be what was attested, or the coin isn't listed:
 * the curve's creator is the launcher, the mint's own metadata carries the
 * signed name, ticker and metadata URI, and the creation transaction was paid
 * for (and so signed) by the attested launcher. `final: false` means "not
 * there yet, check again"; `final: true` means it never will match.
 */
export async function verifyLaunchOnChain(launch: LaunchRow, knownSignature?: string | null): Promise<ChainCheck> {
  const mint = new PublicKey(launch.mint);
  const conn = connection();
  const curveInfo = await conn.getAccountInfo(bondingCurvePda(mint), "confirmed");
  if (!curveInfo) return { ok: false, final: false, reason: "not on chain yet" };

  const curve = PUMP_SDK.decodeBondingCurve(curveInfo);
  if (curve.creator.toBase58() !== launch.creator) return { ok: false, final: true, reason: `on-chain creator ${curve.creator.toBase58()} is not the launcher` };

  const meta = await getTokenMetadata(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID).catch(() => null);
  if (!meta) return { ok: false, final: true, reason: "mint has no token metadata" };
  if (meta.name !== launch.name || meta.symbol !== launch.symbol || meta.uri !== launch.metadata_uri) {
    return { ok: false, final: true, reason: `on-chain metadata differs (${JSON.stringify({ name: meta.name, symbol: meta.symbol, uri: meta.uri })})` };
  }

  const signature = knownSignature ?? (await creationSignature(mint));
  if (!signature) return { ok: false, final: false, reason: "creation transaction not found yet" };
  const tx = await conn.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx) return { ok: false, final: false, reason: "creation transaction not visible yet" };
  const problem = creationProblem(tx, launch);
  if (problem) return { ok: false, final: true, reason: problem };

  const owned = (list: NonNullable<VersionedTransactionResponse["meta"]>["postTokenBalances"]) =>
    Number((list ?? []).find((b) => b.mint === launch.mint && b.owner === launch.creator)?.uiTokenAmount.uiAmountString ?? 0);
  return { ok: true, signature, devTokens: Math.max(0, owned(tx.meta?.postTokenBalances) - owned(tx.meta?.preTokenBalances)) };
}

function creationProblem(tx: VersionedTransactionResponse, launch: LaunchRow): string | null {
  if (tx.meta?.err) return "creation transaction failed";
  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
  if (keys.get(0)?.toBase58() !== launch.creator) return `creation was paid for by ${keys.get(0)?.toBase58()}, not the attested launcher`;
  const created = tx.transaction.message.compiledInstructions.some(
    (ix) => keys.get(ix.programIdIndex)?.equals(PUMP_PROGRAM_ID) && ix.accountKeyIndexes.some((i) => keys.get(i)?.toBase58() === launch.mint),
  );
  const logs = tx.meta?.logMessages ?? [];
  if (!created || !logs.some((l) => /Instruction: Create/.test(l))) return "transaction does not create this coin";
  return null;
}

/** The oldest signature touching the mint: its creation. Bounded to 10 pages (10,000 transactions). */
async function creationSignature(mint: PublicKey): Promise<string | null> {
  let before: string | undefined;
  for (let page = 0; page < 10; page++) {
    const sigs = await connection().getSignaturesForAddress(mint, { limit: 1000, before }, "confirmed");
    if (!sigs.length) return null;
    if (sigs.length < 1000) return sigs[sigs.length - 1].signature;
    before = sigs[sigs.length - 1].signature;
  }
  return null;
}

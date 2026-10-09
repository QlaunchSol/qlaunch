import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { anchorMemo } from "@/lib/pq";
import { rateLimit } from "@/lib/server/cache";
import { identityByWallet, setAnchor } from "@/lib/server/db";
import { bad, clientIp, readJson, route } from "@/lib/server/http";
import { identityDetail } from "@/lib/server/identity";
import { MEMO_PROGRAM_ID, getTransaction } from "@/lib/server/solana";
import { buildTx, feePayer, parseSigned, sendAndConfirm, toBase64, touches } from "@/lib/server/tx";
import { pubkey } from "@/lib/server/validate";

/**
 * Anchors the identity root on Solana with an SPL memo signed by the wallet.
 * POST {wallet}                 → unsigned memo transaction to sign
 * POST {wallet, transaction}    → sends it, confirms, records slot and time
 */
export const POST = route(async (request) => {
  await rateLimit(`anchor:${clientIp(request)}`, 20, 3600);
  const body = await readJson(request);
  const wallet = pubkey(body.wallet, "wallet");
  const identity = (await identityByWallet(wallet)) ?? bad("Register your identity first", 403);
  if (identity.anchor_tx) return Response.json(await identityDetail(identity));
  const memo = anchorMemo(identity.pq_address, identity.root);

  if (!body.transaction) {
    const ix = new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [{ pubkey: new PublicKey(wallet), isSigner: true, isWritable: false }], data: Buffer.from(memo, "utf8") });
    // The Memo program costs ~66k CU for this 145-byte memo (measured on a mainnet fork).
    const tx = await buildTx(new PublicKey(wallet), [ix], 100_000);
    return Response.json({ transaction: toBase64(tx), memo });
  }

  const tx = parseSigned(body.transaction);
  if (feePayer(tx) !== wallet || !touches(tx, MEMO_PROGRAM_ID, wallet)) bad("That isn't the anchor transaction");
  const { signature, confirmed } = await sendAndConfirm(tx);
  if (!confirmed) return Response.json({ signature, pending: true }, { status: 202 });

  // Re-read the landed transaction: record the anchor only if the memo on chain is exactly ours.
  let landed = null;
  for (let i = 0; i < 5 && !landed; i++) {
    landed = await getTransaction(signature);
    if (!landed) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!landed || landed.meta?.err) bad("The anchor transaction didn't land. Try again.");
  const message = landed.transaction.message;
  const keys = message.staticAccountKeys.map((k) => k.toBase58());
  const memoOnChain = message.compiledInstructions.some(
    (ix) => keys[ix.programIdIndex] === MEMO_PROGRAM_ID.toBase58() && Buffer.from(ix.data).toString("utf8") === memo,
  );
  if (!memoOnChain || keys[0] !== wallet) bad("The memo on chain doesn't match this identity");

  const at = landed.blockTime ? new Date(landed.blockTime * 1000).toISOString() : new Date().toISOString();
  const updated = await setAnchor(identity.id, signature, landed.slot, at);
  return Response.json(await identityDetail(updated));
});

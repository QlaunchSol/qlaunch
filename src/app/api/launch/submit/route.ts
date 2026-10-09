import { PUMP_PROGRAM_ID } from "@pump-fun/pump-sdk";
import { rateLimit } from "@/lib/server/cache";
import { db, maybe, type LaunchRow } from "@/lib/server/db";
import { bad, clientIp, readJson, route } from "@/lib/server/http";
import { curveExists, markLive } from "@/lib/server/launch";
import { refreshCoins } from "@/lib/server/market";
import { feePayer, parseSigned, sendAndConfirm, touches } from "@/lib/server/tx";
import { pubkey } from "@/lib/server/validate";

/**
 * POST {mint, transaction}: sends the launch signed by the wallet and the mint
 * key, waits for it, and marks the coin live once its bonding curve exists.
 * POST {mint} alone: re-checks the chain (for a launch sent elsewhere or a
 * response lost to a dropped connection).
 */
export const POST = route(async (request) => {
  await rateLimit(`submit:${clientIp(request)}`, 60, 3600);
  const body = await readJson(request, 8_000);
  const mint = pubkey(body.mint, "mint");
  const launch = maybe(await db().from("launches").select("*").eq("mint", mint).maybeSingle<LaunchRow>()) ?? bad("Unknown launch", 404);
  if (launch.status === "live") return Response.json({ mint, status: "live", signature: launch.tx_signature });

  let signature: string | null = null;
  if (body.transaction) {
    const tx = parseSigned(body.transaction);
    if (feePayer(tx) !== launch.creator || !touches(tx, PUMP_PROGRAM_ID, mint)) bad("That isn't this coin's launch transaction");
    const sent = await sendAndConfirm(tx);
    signature = sent.signature;
    if (!sent.confirmed) return Response.json({ mint, status: "pending", signature }, { status: 202 });
  }

  if (!(await curveExists(mint))) {
    return Response.json({ mint, status: "pending", signature }, { status: 202 });
  }
  await markLive(mint, signature ?? launch.tx_signature);
  await refreshCoins([mint]).catch((e) => console.warn("market refresh:", e));
  return Response.json({ mint, status: "live", signature });
});

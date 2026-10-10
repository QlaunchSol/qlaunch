import { PUMP_PROGRAM_ID } from "@pump-fun/pump-sdk";
import { rateLimit } from "@/lib/server/cache";
import { launchByMint } from "@/lib/server/db";
import { bad, clientIp, readJson, route } from "@/lib/server/http";
import { confirmLaunch, curveExists } from "@/lib/server/launch";
import { refreshCoins } from "@/lib/server/market";
import { feePayer, parseSigned, sendAndConfirm, touches } from "@/lib/server/tx";
import { pubkey } from "@/lib/server/validate";

/**
 * POST {mint, transaction}: sends the launch signed by the wallet and the mint
 * key and waits for it. The coin is listed only once chain matches its
 * attestation (confirmLaunch). Poll progress with GET /api/launch/status.
 */
export const POST = route(async (request) => {
  await rateLimit(`submit:${clientIp(request)}`, 30, 3600, { failClosed: true });
  const body = await readJson(request, 8_000);
  const mint = pubkey(body.mint, "mint");
  const launch = (await launchByMint(mint)) ?? bad("Unknown launch", 404);
  if (launch.status === "live") return Response.json({ mint, status: "live", signature: launch.tx_signature });
  if (await curveExists(mint)) return Response.json({ mint, status: await confirmLaunch(launch) });

  const tx = parseSigned(body.transaction);
  if (feePayer(tx) !== launch.creator || !touches(tx, PUMP_PROGRAM_ID, mint)) bad("That isn't this coin's launch transaction");
  const sent = await sendAndConfirm(tx);
  if (!sent.confirmed) return Response.json({ mint, status: "pending", signature: sent.signature }, { status: 202 });
  const status = await confirmLaunch(launch, sent.signature);
  if (status === "live") await refreshCoins([mint]).catch((e) => console.warn("market refresh:", e));
  return Response.json({ mint, status, signature: sent.signature });
});

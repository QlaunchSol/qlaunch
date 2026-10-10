import { cached, rateLimit } from "@/lib/server/cache";
import { launchByMint } from "@/lib/server/db";
import { bad, clientIp, route } from "@/lib/server/http";
import { confirmLaunch } from "@/lib/server/launch";
import { pubkey } from "@/lib/server/validate";

/**
 * GET /api/launch/status?mint=… → {status, reason?}. Cheap to poll: chain is
 * consulted at most every 4 seconds per coin, whoever asks.
 */
export const GET = route(async (request) => {
  await rateLimit(`status:${clientIp(request)}`, 600, 3600);
  const mint = pubkey(new URL(request.url).searchParams.get("mint"), "mint");
  const launch = (await launchByMint(mint)) ?? bad("Unknown launch", 404);
  if (launch.status !== "pending") return Response.json({ mint, status: launch.status, reason: launch.failure_reason ?? undefined });
  const status = await cached(`launch-status:${mint}`, 4_000, () => confirmLaunch(launch));
  return Response.json({ mint, status }, { headers: { "Cache-Control": "no-store" } });
});

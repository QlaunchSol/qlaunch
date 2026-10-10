import { rateLimit } from "@/lib/server/cache";
import { insertReport, launchByMint } from "@/lib/server/db";
import { bad, clientIp, ipHash, readJson, route } from "@/lib/server/http";
import { text, pubkey } from "@/lib/server/validate";

const REASONS = ["illegal", "sexual", "violence", "scam", "impersonation", "other"] as const;

/** POST {mint, reason, details}: a visitor flags a coin for review. One open report per coin per visitor. */
export const POST = route(async (request) => {
  const ip = clientIp(request);
  await rateLimit(`report:${ip}`, 10, 3600);
  const body = await readJson(request, 4_000);
  const mint = pubkey(body.mint, "coin");
  const reason = REASONS.includes(body.reason as (typeof REASONS)[number]) ? (body.reason as string) : bad("Pick a reason");
  const details = text(body.details, 500, "Details", { multiline: true });
  const launch = await launchByMint(mint);
  if (!launch || launch.status !== "live") bad("Unknown coin", 404);
  await insertReport({ mint, reason, details, ip_hash: ipHash(ip) });
  return Response.json({ ok: true });
});

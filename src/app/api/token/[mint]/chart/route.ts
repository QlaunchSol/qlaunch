import { rateLimit } from "@/lib/server/cache";
import { launchByMint } from "@/lib/server/db";
import { bad, clientIp, route } from "@/lib/server/http";
import { candles, isChartRange } from "@/lib/server/market";
import { isPubkey } from "@/lib/server/validate";

/** GET /api/token/:mint/chart?range=1h|6h|24h|7d → USD candles. */
export const GET = route(async (request: Request, ctx: { params: Promise<{ mint: string }> }) => {
  const { mint } = await ctx.params;
  if (!isPubkey(mint)) bad("Invalid mint");
  await rateLimit(`chart:${clientIp(request)}`, 240, 3600);
  const launch = await launchByMint(mint);
  if (!launch || launch.status !== "live" || launch.hidden) bad("Unknown coin", 404); // never a free proxy for arbitrary tokens
  const range = new URL(request.url).searchParams.get("range") ?? "24h";
  if (!isChartRange(range)) bad("Invalid range");
  return Response.json({ candles: await candles(mint, range) }, { headers: { "Cache-Control": "public, max-age=30" } });
});

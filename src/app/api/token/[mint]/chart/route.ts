import { bad, route } from "@/lib/server/http";
import { candles, isChartRange } from "@/lib/server/market";
import { isPubkey } from "@/lib/server/validate";

/** GET /api/token/:mint/chart?range=1h|6h|24h|7d → USD candles. */
export const GET = route(async (request: Request, ctx: { params: Promise<{ mint: string }> }) => {
  const { mint } = await ctx.params;
  if (!isPubkey(mint)) bad("Invalid mint");
  const range = new URL(request.url).searchParams.get("range") ?? "24h";
  if (!isChartRange(range)) bad("Invalid range");
  return Response.json({ candles: await candles(mint, range) }, { headers: { "Cache-Control": "public, max-age=30" } });
});

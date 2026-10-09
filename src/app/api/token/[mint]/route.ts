import { tokenDetail } from "@/lib/server/coins";
import { bad, route } from "@/lib/server/http";
import { isPubkey } from "@/lib/server/validate";

/** GET /api/token/:mint → the coin, its attestation and the creator's identity. */
export const GET = route(async (_request: Request, ctx: { params: Promise<{ mint: string }> }) => {
  const { mint } = await ctx.params;
  if (!isPubkey(mint)) bad("Invalid mint");
  const detail = await tokenDetail(mint);
  if (!detail.coin) return Response.json(detail, { status: 404 });
  return Response.json(detail, { headers: { "Cache-Control": "public, max-age=5" } });
});

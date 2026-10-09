import { cached } from "@/lib/server/cache";
import { db, maybe } from "@/lib/server/db";
import { bad, route } from "@/lib/server/http";
import { isPubkey } from "@/lib/server/validate";

/**
 * GET /api/token/:mint/metadata → the coin's IPFS metadata JSON, verbatim.
 * Proxied so the in-browser verifier doesn't depend on gateway CORS; the page
 * links the IPFS URI so anyone can fetch it independently and compare.
 */
export const GET = route(async (_request: Request, ctx: { params: Promise<{ mint: string }> }) => {
  const { mint } = await ctx.params;
  if (!isPubkey(mint)) bad("Invalid mint");
  const row = maybe(await db().from("launches").select("metadata_uri").eq("mint", mint).maybeSingle<{ metadata_uri: string }>()) ?? bad("Unknown coin", 404);
  const text = await cached(`metadata:${mint}`, 3600_000, async () => {
    const res = await fetch(row.metadata_uri, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) bad("Couldn't fetch the metadata from IPFS right now", 502);
    const body = await res.text();
    if (body.length > 64_000) bad("Metadata too large", 502);
    return body;
  });
  return new Response(text, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", "X-Metadata-Uri": row.metadata_uri } });
});

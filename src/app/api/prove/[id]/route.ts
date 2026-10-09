import { identityByAddress, proofById } from "@/lib/server/db";
import { bad, route } from "@/lib/server/http";
import { identityJson } from "@/lib/server/identity";


/** GET /api/prove/:id → a recorded proof and its identity, for in-browser re-verification. */
export const GET = route(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) bad("Invalid proof id");
  const proof = await proofById(id);
  if (!proof) return Response.json({ proof: null }, { status: 404 });
  const identity = await identityByAddress(proof.pq_address);
  return Response.json({ proof, identity: identity ? identityJson(identity) : null }, { headers: { "Cache-Control": "public, max-age=60" } });
});

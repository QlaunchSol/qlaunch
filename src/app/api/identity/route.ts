import { isPqAddress } from "@/lib/pq";
import { identityByAddress, identityByWallet } from "@/lib/server/db";
import { bad, route } from "@/lib/server/http";
import { identityDetail } from "@/lib/server/identity";
import { isPubkey } from "@/lib/server/validate";

/** GET /api/identity?wallet=… or ?address=pq1… */
export const GET = route(async (request) => {
  const params = new URL(request.url).searchParams;
  const wallet = params.get("wallet");
  const address = params.get("address");
  let row;
  if (wallet) row = isPubkey(wallet) ? await identityByWallet(wallet) : bad("Invalid wallet");
  else if (address) row = isPqAddress(address) ? await identityByAddress(address) : bad("Invalid pq address");
  else bad("Pass ?wallet= or ?address=");
  if (!row) return Response.json({ identity: null }, { status: 404 });
  return Response.json(await identityDetail(row), { headers: { "Cache-Control": "no-store" } });
});

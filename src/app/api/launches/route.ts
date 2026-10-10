import { isSort, listCoins } from "@/lib/server/coins";
import { rateLimit } from "@/lib/server/cache";
import { clientIp, route } from "@/lib/server/http";

/** GET /api/launches?sort=new|mcap|volume|holders&graduated=1&q=…&page=0 */
export const GET = route(async (request) => {
  await rateLimit(`list:${clientIp(request)}`, 600, 3600);
  const params = new URL(request.url).searchParams;
  const sort = params.get("sort");
  const page = Math.min(200, Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0));
  const result = await listCoins({
    sort: isSort(sort) ? sort : "new",
    graduated: params.get("graduated") === "1",
    q: ((q) => (q.length >= 2 ? q : ""))((params.get("q") ?? "").trim().slice(0, 64)),
    page,
  });
  return Response.json(result, { headers: { "Cache-Control": "public, max-age=5" } });
});

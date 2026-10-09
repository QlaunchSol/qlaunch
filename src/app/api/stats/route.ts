import { platformStats } from "@/lib/server/coins";
import { route } from "@/lib/server/http";

export const GET = route(async () => Response.json(await platformStats(), { headers: { "Cache-Control": "public, max-age=30" } }));

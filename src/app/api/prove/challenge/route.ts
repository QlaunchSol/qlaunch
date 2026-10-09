import { randomBytes } from "node:crypto";
import { isPqAddress } from "@/lib/pq";
import { put, rateLimit } from "@/lib/server/cache";
import { identityByAddress } from "@/lib/server/db";
import { bad, clientIp, readJson, route } from "@/lib/server/http";

const CHALLENGE_TTL_MS = 10 * 60_000;

/** POST {address} → a one-time challenge for that identity, valid ten minutes. */
export const POST = route(async (request) => {
  await rateLimit(`challenge:${clientIp(request)}`, 30, 3600);
  const body = await readJson(request);
  if (!isPqAddress(body.address)) bad("Invalid pq address");
  if (!(await identityByAddress(body.address as string))) bad("No registered identity at that address", 404);
  const challenge = randomBytes(32).toString("hex");
  await put(`challenge:${challenge}`, body.address as string, CHALLENGE_TTL_MS);
  return Response.json({ challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString() });
});

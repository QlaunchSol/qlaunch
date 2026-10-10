import { bytesToHex, launchDigest } from "@/lib/pq";
import { rateLimit } from "@/lib/server/cache";
import { launchByMint, usedLeaves } from "@/lib/server/db";
import { bad, clientIp, readJson, route } from "@/lib/server/http";
import { buildLaunchTx, curveExists, placeholderUri } from "@/lib/server/launch";
import { launchFields, leafOf, parseLaunchRequest } from "@/lib/server/launch-request";

/**
 * POST {wallet, mint, leaf, …fields, devBuySol} → {ok, digest}: every check
 * that doesn't need the signature, run BEFORE the browser signs. A one-time
 * key should only ever sign a launch that will then go through: once a
 * signature exists the key is spent, whatever happens next.
 */
export const POST = route(async (request) => {
  await rateLimit(`preflight:${clientIp(request)}`, 120, 3600);
  const body = await readJson(request, 16_000);
  const req = await parseLaunchRequest(body);
  const leaf = leafOf(body.leaf);
  const digest = bytesToHex(launchDigest(launchFields(req, leaf)));

  const spent = (await usedLeaves(req.identity.id)).find((u) => u.leaf === leaf);
  const existing = await launchByMint(req.mint);
  // A retry of this exact signed launch: its row exists, or the key was spent on this digest before the row was written.
  const retry = (existing && existing.identity_id === req.identity.id && existing.digest === digest) || (!existing && spent?.purpose === "launch" && spent.digest === digest);
  if (existing?.status === "live") return Response.json({ ok: true, digest, status: "live" });
  if (spent && !retry) bad(`One-time key #${leaf} is already used.`, 409, "key_spent");
  if (existing && !retry) bad(`One-time key #${leaf} is already used.`, 409, "key_spent");
  // The mint is derived from the key: a coin already on chain at this mint means this key launched
  // it before, whatever this server's records say (e.g. after a database restore).
  if (!existing && (await curveExists(req.mint))) bad(`One-time key #${leaf} already launched a coin.`, 409, "key_spent");

  // Sizes the real transaction (same length metadata URI) so nothing fails after signing.
  await buildLaunchTx({ wallet: req.wallet, mint: req.mint, name: req.form.name, symbol: req.form.symbol, uri: existing?.metadata_uri ?? placeholderUri(), devBuySol: req.devBuySol });
  return Response.json({ ok: true, digest, status: existing?.status ?? "new" });
});

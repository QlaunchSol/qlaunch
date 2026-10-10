import { REGISTRATION_LEAF, bytesToHex, hexToBytes, isHex, launchDigest, signatureFromBase64, verify } from "@/lib/pq";
import { rateLimit } from "@/lib/server/cache";
import { burnLeaf, insertLaunch, launchByMint, markUploadUsed, publicIdentity } from "@/lib/server/db";
import { bad, clientIp, readJson, route } from "@/lib/server/http";
import { buildLaunchTx, confirmLaunch, curveExists, launchMetadata } from "@/lib/server/launch";
import { launchFields, parseLaunchRequest } from "@/lib/server/launch-request";
import { pinJson } from "@/lib/server/pinata";
import { toBase64 } from "@/lib/server/tx";

/**
 * Verifies a launch attestation, spends its one-time key, pins the metadata and
 * returns the unsigned create transaction (the browser ran /preflight first).
 *
 * The key is spent the moment a valid signature arrives, before anything else
 * can fail: a WOTS signature that left the browser must never be followed by a
 * second one from the same key. A retry of the same signed launch (same leaf,
 * same digest) is fine and gets a fresh transaction without re-pinning.
 */
export const POST = route(async (request) => {
  await rateLimit(`prepare:${clientIp(request)}`, 30, 3600, { failClosed: true });
  const body = await readJson(request, 16_000);
  const req = await parseLaunchRequest(body);
  const signature = signatureFromBase64(body.signature) ?? bad("Missing post-quantum signature");
  if (signature.leaf === REGISTRATION_LEAF) bad("One-time key 0 is reserved for registration");
  const identity = publicIdentity(req.identity);
  const fields = launchFields(req, signature.leaf);
  const digest = bytesToHex(launchDigest(fields));

  if (!verify(hexToBytes(digest), signature, identity).valid) {
    // Signed, but over details that normalize differently here: still a revealed signature, so spend the key.
    if (isHex(body.digest, 32) && verify(hexToBytes(body.digest as string), signature, identity).valid) {
      await burnLeaf({ identityId: req.identity.id, leaf: signature.leaf, purpose: "launch", digest: body.digest as string, ref: null }).catch(() => {});
      bad("The launch details changed after signing. Your next attempt will use a fresh key.");
    }
    bad("The post-quantum signature doesn't verify against your identity");
  }
  await burnLeaf({ identityId: req.identity.id, leaf: signature.leaf, purpose: "launch", digest, ref: req.mint });

  const existing = await launchByMint(req.mint);
  if (existing && (existing.identity_id !== req.identity.id || existing.digest !== digest)) bad("That mint is already taken", 409);
  if (existing && (await curveExists(req.mint))) {
    // Already landed (a lost response, a second tab): confirm instead of building another transaction.
    return Response.json({ mint: req.mint, metadataUri: existing.metadata_uri, status: await confirmLaunch(existing) });
  }
  if (!existing && (await curveExists(req.mint))) bad("That mint already exists on pump.fun", 409);

  let uri = existing?.metadata_uri;
  if (!uri) {
    const signatureB64 = String(body.signature);
    const pinned = await pinJson(launchMetadata(fields, req.identity, digest, signatureB64), `${req.form.symbol}.json`);
    uri = pinned.url;
    const inserted = await insertLaunch({
      mint: req.mint,
      identity_id: req.identity.id,
      creator: req.wallet,
      pq_address: req.identity.pq_address,
      leaf: signature.leaf,
      name: req.form.name,
      symbol: req.form.symbol,
      description: req.form.description,
      twitter: req.form.twitter,
      telegram: req.form.telegram,
      image_url: req.form.image,
      metadata_uri: uri,
      metadata_pin_id: pinned.id,
      website: null,
      digest,
      signature: signatureB64,
      dev_buy_sol: req.devBuySol,
    });
    if (!inserted) bad("This launch is already being prepared. Refresh and try again.", 409);
    await markUploadUsed(req.form.image);
  }

  const tx = await buildLaunchTx({ wallet: req.wallet, mint: req.mint, name: req.form.name, symbol: req.form.symbol, uri, devBuySol: req.devBuySol });
  return Response.json({ mint: req.mint, metadataUri: uri, transaction: toBase64(tx), status: "pending" });
});

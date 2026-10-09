import { REGISTRATION_LEAF, bytesToHex, launchDigest, signatureFromBase64, verify, type LaunchFields } from "@/lib/pq";
import { rateLimit } from "@/lib/server/cache";
import { burnLeaf, identityByWallet, insertLaunch, launchByMint, publicIdentity, setDevBuy } from "@/lib/server/db";
import { bad, clientIp, readJson, route } from "@/lib/server/http";
import { MAX_DEV_BUY_SOL, buildLaunchTx, curveExists, launchMetadata } from "@/lib/server/launch";
import { isGatewayUrl, pinJson } from "@/lib/server/pinata";
import { toBase64 } from "@/lib/server/tx";
import { cleanLaunchForm } from "@/lib/fields";
import { field, pubkey } from "@/lib/server/validate";

/**
 * Verifies a launch attestation, spends its one-time key, pins the metadata and
 * returns the unsigned create transaction. Safe to retry: the same signed
 * launch (same leaf, same digest) gets a fresh transaction without re-pinning.
 *
 * The mint keypair is derived in the browser from the identity seed and the
 * leaf, so the server never holds it.
 */
export const POST = route(async (request) => {
  await rateLimit(`prepare:${clientIp(request)}`, 30, 3600);
  const body = await readJson(request, 16_000);

  const wallet = pubkey(body.wallet, "wallet");
  const mint = pubkey(body.mint, "mint");
  const form = field(() => cleanLaunchForm(body));
  if (!isGatewayUrl(form.image)) bad("Upload the image first");
  const { name, symbol, description, image, twitter, telegram } = form;
  const devBuySol = Number(body.devBuySol ?? 0);
  if (!Number.isFinite(devBuySol) || devBuySol < 0 || devBuySol > MAX_DEV_BUY_SOL) bad(`Dev buy must be between 0 and ${MAX_DEV_BUY_SOL} SOL`);

  const signature = signatureFromBase64(body.signature) ?? bad("Missing post-quantum signature");
  if (signature.leaf === REGISTRATION_LEAF) bad("One-time key 0 is reserved for registration");

  const identity = (await identityByWallet(wallet)) ?? bad("Register a post-quantum identity first", 403);
  const fields: LaunchFields = { mint, creator: wallet, pqAddress: identity.pq_address, leaf: signature.leaf, name, symbol, description, image, twitter, telegram };
  const digest = bytesToHex(launchDigest(fields));
  // Must be the exact fields the client signed; any difference fails here.
  if (body.digest !== digest) bad("The launch details changed after signing. Sign again.");
  if (!verify(launchDigest(fields), signature, publicIdentity(identity)).valid) bad("The post-quantum signature doesn't verify against your identity");

  const existing = await launchByMint(mint);
  if (existing && (existing.identity_id !== identity.id || existing.digest !== digest)) bad("That mint is already taken", 409);
  if (existing?.status === "live") bad("This coin is already live", 409);
  if (!existing && (await curveExists(mint))) bad("That mint already exists on pump.fun", 409);

  await burnLeaf({ identityId: identity.id, leaf: signature.leaf, purpose: "launch", digest, ref: mint });

  let uri = existing?.metadata_uri;
  if (!uri) {
    const signatureB64 = String(body.signature);
    uri = (await pinJson(launchMetadata(fields, identity, digest, signatureB64), `${symbol}.json`)).url;
    const inserted = await insertLaunch({
      mint,
      identity_id: identity.id,
      creator: wallet,
      pq_address: identity.pq_address,
      leaf: signature.leaf,
      name,
      symbol,
      description,
      image_url: image,
      metadata_uri: uri,
      twitter,
      telegram,
      website: null,
      digest,
      signature: signatureB64,
      dev_buy_sol: devBuySol,
    });
    if (!inserted) bad("This launch is already being prepared. Refresh and try again.", 409);
  } else if (existing && Number(existing.dev_buy_sol) !== devBuySol) {
    await setDevBuy(mint, devBuySol);
  }

  const tx = await buildLaunchTx({ wallet, mint, name, symbol, uri, devBuySol });
  return Response.json({ mint, metadataUri: uri, transaction: toBase64(tx) });
});

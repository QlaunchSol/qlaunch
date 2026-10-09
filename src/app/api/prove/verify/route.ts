import { randomBytes } from "node:crypto";
import { REGISTRATION_LEAF, bytesToHex, isPqAddress, proveDigest, signatureFromBase64, verify } from "@/lib/pq";
import { rateLimit, take } from "@/lib/server/cache";
import { burnLeaf, db, identityByAddress, ok, publicIdentity } from "@/lib/server/db";
import { bad, clientIp, readJson, route } from "@/lib/server/http";
import { text } from "@/lib/server/validate";

/**
 * POST {address, challenge, note, signature}: checks a one-time-key signature
 * over the challenge against the identity root. No wallet and no ed25519 are
 * involved, so this keeps working after a curve break. Records a public proof.
 */
export const POST = route(async (request) => {
  await rateLimit(`prove:${clientIp(request)}`, 30, 3600);
  const body = await readJson(request, 16_000);
  if (!isPqAddress(body.address)) bad("Invalid pq address");
  const address = body.address as string;
  const challenge = typeof body.challenge === "string" && /^[0-9a-f]{64}$/.test(body.challenge) ? body.challenge : bad("Invalid challenge");
  const note = text(body.note, 140, "Note");
  const signature = signatureFromBase64(body.signature) ?? bad("Missing post-quantum signature");
  if (signature.leaf === REGISTRATION_LEAF) bad("One-time key 0 is reserved for registration");

  const identity = (await identityByAddress(address)) ?? bad("No registered identity at that address", 404);
  const digest = proveDigest({ pqAddress: address, challenge, leaf: signature.leaf, note });
  // Verify before consuming the challenge, so a bad signature doesn't burn it.
  if (!verify(digest, signature, publicIdentity(identity)).valid) bad("The signature doesn't verify against this identity");
  if ((await take(`challenge:${challenge}`)) !== address) bad("That challenge expired or was already used. Request a new one.", 410);

  const digestHex = bytesToHex(digest);
  const id = randomBytes(9).toString("base64url");
  await burnLeaf({ identityId: identity.id, leaf: signature.leaf, purpose: "prove", digest: digestHex, ref: id });
  ok(
    await db().from("proofs").insert({ id, identity_id: identity.id, pq_address: address, leaf: signature.leaf, challenge, note, digest: digestHex, signature: String(body.signature) }),
  );
  return Response.json({ id }, { status: 201 });
});

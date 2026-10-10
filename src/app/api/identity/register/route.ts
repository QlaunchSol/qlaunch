import { ed25519 } from "@noble/curves/ed25519.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  REGISTRATION_LEAF,
  bytesToHex,
  identityFromHex,
  isHex,
  pqAddress,
  registrationDigest,
  registrationStatement,
  signatureFromBase64,
  verify,
} from "@/lib/pq";
import { rateLimit } from "@/lib/server/cache";
import { burnLeaf, identityByWallet, insertIdentity } from "@/lib/server/db";
import { bad, clientIp, readJson, route } from "@/lib/server/http";
import { identityDetail } from "@/lib/server/identity";
import { pubkey } from "@/lib/server/validate";

/**
 * Registers wallet ⇄ identity. Both directions are proven: the wallet signs
 * the statement with ed25519, and the identity signs the same statement with
 * one-time key 0. Neither key alone can claim the other.
 */
export const POST = route(async (request) => {
  await rateLimit(`register:${clientIp(request)}`, 10, 3600);
  const body = await readJson(request);
  const wallet = pubkey(body.wallet, "wallet");
  if (!isHex(body.root, 32) || !isHex(body.pubSeed, 32)) bad("Invalid identity");
  const epoch = 0;
  const identity = identityFromHex({ root: body.root, pubSeed: body.pubSeed, height: 8, epoch })!;
  const address = pqAddress(identity);

  const existing = await identityByWallet(wallet);
  if (existing) {
    if (existing.root === body.root) return Response.json(await identityDetail(existing));
    bad("This wallet is already registered to a different identity. Did you use a different passphrase?", 409);
  }

  const statement = registrationStatement({ wallet, pqAddress: address, root: body.root as string, pubSeed: body.pubSeed as string, epoch });
  if (body.statement !== statement) bad("Statement doesn't match the identity");

  let walletOk = false;
  try {
    const sig = bs58.decode(String(body.walletSignature));
    walletOk = sig.length === 64 && ed25519.verify(sig, utf8ToBytes(statement), new PublicKey(wallet).toBytes());
  } catch {}
  if (!walletOk) bad("Wallet signature doesn't verify");

  const pqSig = signatureFromBase64(body.signature) ?? bad("Missing post-quantum signature");
  if (pqSig.leaf !== REGISTRATION_LEAF) bad("Registration must be signed with one-time key 0");
  const digest = registrationDigest(statement);
  if (!verify(digest, pqSig, identity).valid) bad("Post-quantum signature doesn't verify against this identity");

  const row =
    (await insertIdentity({
      wallet,
      pq_address: address,
      root: body.root as string,
      pub_seed: body.pubSeed as string,
      height: 8,
      epoch,
      statement,
      wallet_signature: String(body.walletSignature),
      registration_signature: String(body.signature),
    })) ?? bad("This wallet or identity is already registered", 409);
  await burnLeaf({ identityId: row.id, leaf: REGISTRATION_LEAF, purpose: "register", digest: bytesToHex(digest), ref: wallet });
  return Response.json(await identityDetail(row), { status: 201 });
});

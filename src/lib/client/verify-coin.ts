import { ed25519 } from "@noble/curves/ed25519.js";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  PROTOCOL,
  REGISTRATION_LEAF,
  bytesToHex,
  identityFromHex,
  launchDigest,
  pqAddress,
  registrationDigest,
  signatureFromBase64,
  verify,
  type VerifyTrace,
} from "@/lib/pq";
import type { IdentityJson } from "@/lib/types";

export type Step = { id: string; title: string; ok: boolean | null; detail: string };
export type CoinVerification = { steps: Step[]; trace: VerifyTrace | null; valid: boolean; metadata: Record<string, unknown> | null };

type Metadata = {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  twitter?: string;
  telegram?: string;
  pq?: {
    protocol?: string;
    mint?: string;
    creator?: string;
    leaf?: number;
    identity?: { address?: string; root?: string; pubSeed?: string; height?: number; epoch?: number };
    digest?: string;
    signature?: string;
  };
};

/**
 * Verifies a coin entirely in the browser: metadata → digest → WOTS chains →
 * Merkle root → registered identity → the identity's own registration
 * signatures. Each step is reported, pass or fail, so the page can show its
 * work. Only SHA-256 (and, for the wallet binding, ed25519) is used.
 */
export async function verifyCoin(mint: string, identity: IdentityJson | null): Promise<CoinVerification> {
  const steps: Step[] = [];
  const add = (id: string, title: string, ok: boolean | null, detail: string) => steps.push({ id, title, ok, detail });
  let trace: VerifyTrace | null = null;

  const res = await fetch(`/api/token/${mint}/metadata`);
  if (!res.ok) {
    add("metadata", "Fetch the coin's metadata", false, "The metadata couldn't be fetched from IPFS right now.");
    return { steps, trace, valid: false, metadata: null };
  }
  const meta = (await res.json()) as Metadata;
  const uri = res.headers.get("X-Metadata-Uri") ?? "";
  const pq = meta.pq;
  add("metadata", "Fetch the coin's metadata", Boolean(pq), pq ? `Pinned on IPFS at ${uri}` : "The metadata carries no post-quantum attestation.");
  if (!pq) return { steps, trace, valid: false, metadata: meta as Record<string, unknown> };

  const protocolOk = pq.protocol === PROTOCOL && pq.mint === mint;
  add("protocol", "Attestation is for this coin", protocolOk, protocolOk ? `${PROTOCOL}, mint ${mint}` : "The attestation names a different coin or protocol.");

  const id = identityFromHex({ root: pq.identity?.root, pubSeed: pq.identity?.pubSeed, height: pq.identity?.height, epoch: pq.identity?.epoch });
  const address = pq.identity?.address ?? "";
  const addressOk = Boolean(id && pqAddress(id) === address);
  add("address", "Identity address matches its root", addressOk, addressOk ? `${address} = H(pubSeed ‖ root)` : "The address isn't derived from the root in the metadata.");

  const digest = launchDigest({
    mint,
    creator: pq.creator ?? "",
    pqAddress: address,
    leaf: typeof pq.leaf === "number" && pq.leaf >= 0 ? pq.leaf : 0,
    name: meta.name ?? "",
    symbol: meta.symbol ?? "",
    description: meta.description ?? "",
    image: meta.image ?? "",
    twitter: meta.twitter ?? "",
    telegram: meta.telegram ?? "",
  });
  const digestOk = bytesToHex(digest) === pq.digest;
  add("digest", "Rebuild the signed digest from public fields", digestOk, digestOk ? bytesToHex(digest) : "The metadata's fields don't hash to the signed digest: something was changed.");

  const sig = signatureFromBase64(pq.signature);
  if (!sig || !id || sig.leaf !== pq.leaf) {
    add("signature", "Verify the one-time signature", false, "The signature is missing or malformed.");
    return { steps, trace, valid: false, metadata: meta as Record<string, unknown> };
  }
  trace = verify(digest, sig, id);
  add(
    "signature",
    "Verify the one-time signature",
    trace.valid,
    trace.valid
      ? `Key #${sig.leaf}: ${trace.steps} hash steps along 67 chains, then 8 tree levels to the root.`
      : "The signature does not lead to this identity's root.",
  );

  let registryOk: boolean | null = null;
  let detail = "This identity isn't in the registry.";
  if (identity) {
    registryOk = identity.root === pq.identity?.root && identity.pubSeed === pq.identity?.pubSeed && identity.address === address;
    detail = registryOk ? `Registered to wallet ${identity.wallet}` : "The registry holds a different root for this address.";
  }
  add("registry", "Identity is registered", registryOk, detail);

  if (identity && registryOk) {
    let walletOk = false;
    try {
      walletOk = ed25519.verify(bs58.decode(identity.walletSignature), new TextEncoder().encode(identity.statement), new PublicKey(identity.wallet).toBytes());
    } catch {}
    const regSig = signatureFromBase64(identity.registrationSignature);
    const leaf0Ok = Boolean(regSig && regSig.leaf === REGISTRATION_LEAF && verify(registrationDigest(identity.statement), regSig, id).valid);
    const statementOk = identity.statement.includes(`Identity: ${address}`) && identity.statement.includes(`Wallet: ${identity.wallet}`);
    add(
      "binding",
      "Wallet and identity signed each other",
      walletOk && leaf0Ok && statementOk,
      walletOk && leaf0Ok && statementOk ? "ed25519 signature by the wallet and one-time key #0 over the same statement." : "The registration statement's signatures don't check out.",
    );
    add(
      "anchor",
      "Root anchored on Solana",
      identity.anchor ? true : null,
      identity.anchor ? `Memo in slot ${identity.anchor.slot ?? "?"}${identity.anchor.at ? `, ${new Date(identity.anchor.at).toUTCString()}` : ""}` : "Not anchored yet (optional).",
    );
  }

  const valid = steps.every((s) => s.ok !== false);
  return { steps, trace, valid, metadata: meta as Record<string, unknown> };
}

import { bytesToHex, equalBytes, fromBase64, readU32be, toBase64, u32be } from "./bytes";
import { rootFromPath } from "./merkle";
import { AUTH_PATH_BYTES, HEIGHT, LEAVES, N, SIGNATURE_BYTES, WOTS_SIG_BYTES } from "./params";
import { compress, wotsPkFromSig } from "./wots";

/** What anyone needs to verify: the tree root and the seed every hash is keyed with. */
export type PublicIdentity = { root: Uint8Array; pubSeed: Uint8Array; height: number; epoch: number };

export type Signature = { leaf: number; wots: Uint8Array; auth: Uint8Array };

export function encodeSignature(sig: Signature): Uint8Array {
  const out = new Uint8Array(SIGNATURE_BYTES);
  out.set(u32be(sig.leaf), 0);
  out.set(sig.wots, 4);
  out.set(sig.auth, 4 + WOTS_SIG_BYTES);
  return out;
}

export function decodeSignature(bytes: Uint8Array): Signature {
  if (bytes.length !== SIGNATURE_BYTES) throw new Error(`signature must be ${SIGNATURE_BYTES} bytes`);
  const leaf = readU32be(bytes, 0);
  if (leaf >= LEAVES) throw new Error("leaf index out of range");
  return { leaf, wots: bytes.slice(4, 4 + WOTS_SIG_BYTES), auth: bytes.slice(4 + WOTS_SIG_BYTES, 4 + WOTS_SIG_BYTES + AUTH_PATH_BYTES) };
}

/** JSON form used in metadata and APIs: base64 of the 2,404-byte encoding. */
export const signatureToBase64 = (sig: Signature) => toBase64(encodeSignature(sig));
export function signatureFromBase64(value: unknown): Signature | null {
  if (typeof value !== "string" || value.length > 4000) return null;
  try {
    return decodeSignature(fromBase64(value));
  } catch {
    return null;
  }
}

export type VerifyTrace = {
  digest: string;
  leaf: number;
  /** 67 base-16 digits: 64 from the digest, 3 checksum. */
  digits: number[];
  /** Hash steps the verifier walked (sum of 15 - digit). */
  steps: number;
  leafHash: string;
  /** Node computed at each height, 1..8. */
  path: { height: number; index: number; node: string; sibling: string }[];
  computedRoot: string;
  expectedRoot: string;
  valid: boolean;
};

/**
 * Verifies a signature over a 32-byte digest. Only SHA-256 is involved: walk the
 * WOTS chains to their ends, compress them into a leaf, hash up the auth path,
 * compare with the identity root.
 */
export function verify(digest: Uint8Array, sig: Signature, identity: PublicIdentity): VerifyTrace {
  if (identity.height !== HEIGHT) throw new Error(`unsupported tree height ${identity.height}`);
  if (identity.root.length !== N || identity.pubSeed.length !== N) throw new Error("malformed identity");
  const { digits, chainEnds } = wotsPkFromSig(digest, sig.wots, identity.pubSeed, identity.epoch, sig.leaf);
  const leafHash = compress(identity.pubSeed, identity.epoch, sig.leaf, chainEnds);
  const path: VerifyTrace["path"] = [];
  const root = rootFromPath(identity.pubSeed, identity.epoch, sig.leaf, leafHash, sig.auth, (height, index, node, sibling) =>
    path.push({ height, index, node: bytesToHex(node), sibling: bytesToHex(sibling) }),
  );
  return {
    digest: bytesToHex(digest),
    leaf: sig.leaf,
    digits,
    steps: digits.reduce((s, d) => s + 15 - d, 0),
    leafHash: bytesToHex(leafHash),
    path,
    computedRoot: bytesToHex(root),
    expectedRoot: bytesToHex(identity.root),
    valid: equalBytes(root, identity.root),
  };
}

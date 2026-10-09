import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { N } from "./params";

/**
 * Tweakable hash over SHA-256 in the style of SPHINCS+ "simple": every call is
 * keyed by the identity's public seed and a 32-byte address (ADRS) naming the
 * exact position in the structure, so no two calls anywhere hash the same
 * (seed, position) pair, which is what multi-target attacks need.
 */

export const ADRS_BYTES = 32;

export const AdrsType = {
  /** A step inside a WOTS hash chain. */
  WotsHash: 0,
  /** Compressing a WOTS public key (67 chain ends) into one leaf. */
  WotsPk: 1,
  /** An internal Merkle node. */
  Tree: 2,
  /** Deriving a WOTS secret chain start from the secret seed. */
  WotsPrf: 3,
} as const;

export type Adrs = {
  type: (typeof AdrsType)[keyof typeof AdrsType];
  /** Identity epoch (a seed can derive several trees); 0 for the first. */
  epoch?: number;
  /** WOTS key / leaf index. Unused (0) for tree nodes. */
  leaf?: number;
  /** WOTS: chain index. Tree: node height (1 = parents of leaves). */
  a?: number;
  /** WOTS: hash step. Tree: node index within its level. */
  b?: number;
};

/**
 * Layout (big-endian u32 words):
 *   [0] type  [1] epoch  [2] leaf  [3] a (chain / height)  [4] b (step / index)  [5..7] zero
 */
export function adrs({ type, epoch = 0, leaf = 0, a = 0, b = 0 }: Adrs): Uint8Array {
  const out = new Uint8Array(ADRS_BYTES);
  const v = new DataView(out.buffer);
  v.setUint32(0, type);
  v.setUint32(4, epoch);
  v.setUint32(8, leaf);
  v.setUint32(12, a);
  v.setUint32(16, b);
  return out;
}

/** Writes the hash-step word in place: chains call F up to 15 times with only this word changing. */
export function setStep(address: Uint8Array, step: number) {
  new DataView(address.buffer, address.byteOffset).setUint32(16, step);
}

const buf96 = new Uint8Array(96);

/** F: one chain step. SHA-256(pubSeed ‖ ADRS ‖ x), a 96-byte input. */
export function F(pubSeed: Uint8Array, address: Uint8Array, x: Uint8Array): Uint8Array {
  buf96.set(pubSeed, 0);
  buf96.set(address, 32);
  buf96.set(x, 64);
  return sha256(buf96);
}

const buf128 = new Uint8Array(128);

/** H: a Merkle node. SHA-256(pubSeed ‖ ADRS ‖ left ‖ right). */
export function H(pubSeed: Uint8Array, address: Uint8Array, left: Uint8Array, right: Uint8Array): Uint8Array {
  buf128.set(pubSeed, 0);
  buf128.set(address, 32);
  buf128.set(left, 64);
  buf128.set(right, 96);
  return sha256(buf128);
}

/** T: compresses a WOTS public key. SHA-256(pubSeed ‖ ADRS ‖ pk[0] ‖ … ‖ pk[66]). */
export function T(pubSeed: Uint8Array, address: Uint8Array, chainEnds: Uint8Array): Uint8Array {
  const h = sha256.create();
  h.update(pubSeed);
  h.update(address);
  h.update(chainEnds);
  return h.digest();
}

/** PRF: a secret chain start. HMAC-SHA256(skSeed, pubSeed ‖ ADRS). */
export function PRF(skSeed: Uint8Array, pubSeed: Uint8Array, address: Uint8Array): Uint8Array {
  const h = hmac.create(sha256, skSeed);
  h.update(pubSeed);
  h.update(address);
  const out = h.digest();
  if (out.length !== N) throw new Error("PRF output length");
  return out;
}

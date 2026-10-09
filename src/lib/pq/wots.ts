import { AdrsType, F, PRF, T, adrs, setStep } from "./hash";
import { LEN, LEN1, LEN2, LOG_W, N, W } from "./params";

/**
 * Winternitz one-time signatures (WOTS+, w = 16) over the tweakable hash.
 *
 * A key is 67 hash chains of length 15. The secret key is each chain's start,
 * the public key each chain's end. Signing a digit d reveals chain position d;
 * a verifier walks the remaining 15 - d steps and must land on the public end.
 * The checksum digits make every forgery need some chain walked backwards,
 * i.e. a SHA-256 preimage.
 */

/** Splits bytes into `count` base-16 digits, high nibble first. */
function baseW(bytes: Uint8Array, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; out.length < count; i++) {
    out.push(bytes[i] >> 4);
    if (out.length < count) out.push(bytes[i] & 0x0f);
  }
  return out;
}

/** 32-byte digest → 64 message digits + 3 checksum digits. */
export function encodeDigest(digest: Uint8Array): number[] {
  if (digest.length !== N) throw new Error("digest must be 32 bytes");
  const msg = baseW(digest, LEN1);
  let csum = 0;
  for (const d of msg) csum += W - 1 - d;
  // Left-align the 12 checksum bits in two bytes (RFC 8391 §3.1.5).
  csum <<= (8 - ((LEN2 * LOG_W) % 8)) % 8;
  return msg.concat(baseW(new Uint8Array([(csum >> 8) & 0xff, csum & 0xff]), LEN2));
}

/** Walks `steps` hash steps of chain `chain`, starting at position `start`. */
export function chain(x: Uint8Array, start: number, steps: number, pubSeed: Uint8Array, epoch: number, leaf: number, chainIndex: number): Uint8Array {
  const address = adrs({ type: AdrsType.WotsHash, epoch, leaf, a: chainIndex });
  let out = x;
  for (let i = start; i < start + steps && i < W - 1; i++) {
    setStep(address, i);
    out = F(pubSeed, address, out);
  }
  return out;
}

function secretStart(skSeed: Uint8Array, pubSeed: Uint8Array, epoch: number, leaf: number, chainIndex: number) {
  return PRF(skSeed, pubSeed, adrs({ type: AdrsType.WotsPrf, epoch, leaf, a: chainIndex }));
}

/** The leaf (compressed public key) of one-time key `leaf`. */
export function wotsLeaf(skSeed: Uint8Array, pubSeed: Uint8Array, epoch: number, leaf: number): Uint8Array {
  const ends = new Uint8Array(LEN * N);
  for (let i = 0; i < LEN; i++) ends.set(chain(secretStart(skSeed, pubSeed, epoch, leaf, i), 0, W - 1, pubSeed, epoch, leaf, i), i * N);
  return compress(pubSeed, epoch, leaf, ends);
}

export function compress(pubSeed: Uint8Array, epoch: number, leaf: number, chainEnds: Uint8Array): Uint8Array {
  return T(pubSeed, adrs({ type: AdrsType.WotsPk, epoch, leaf }), chainEnds);
}

/** Signs a 32-byte digest with one-time key `leaf`. Returns 67 × 32 bytes. */
export function wotsSign(digest: Uint8Array, skSeed: Uint8Array, pubSeed: Uint8Array, epoch: number, leaf: number): Uint8Array {
  const digits = encodeDigest(digest);
  const sig = new Uint8Array(LEN * N);
  for (let i = 0; i < LEN; i++) sig.set(chain(secretStart(skSeed, pubSeed, epoch, leaf, i), 0, digits[i], pubSeed, epoch, leaf, i), i * N);
  return sig;
}

/**
 * Completes every chain from the signature: the result is the public key the
 * signature implies. It verifies iff its compression is a leaf of the tree.
 */
export function wotsPkFromSig(digest: Uint8Array, sig: Uint8Array, pubSeed: Uint8Array, epoch: number, leaf: number): { digits: number[]; chainEnds: Uint8Array } {
  if (sig.length !== LEN * N) throw new Error("WOTS signature must be 2,144 bytes");
  const digits = encodeDigest(digest);
  const chainEnds = new Uint8Array(LEN * N);
  for (let i = 0; i < LEN; i++) {
    chainEnds.set(chain(sig.subarray(i * N, (i + 1) * N), digits[i], W - 1 - digits[i], pubSeed, epoch, leaf, i), i * N);
  }
  return { digits, chainEnds };
}

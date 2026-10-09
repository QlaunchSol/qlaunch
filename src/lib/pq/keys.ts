import { hkdf } from "@noble/hashes/hkdf.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, concatBytes, u32be, utf8ToBytes } from "./bytes";
import { authPath, buildTree } from "./merkle";
import { HEIGHT, LEAVES, PROTOCOL } from "./params";
import { pqAddress } from "./address";
import type { PublicIdentity, Signature } from "./signature";
import { wotsLeaf, wotsSign } from "./wots";

/** scrypt cost for the optional passphrase: 2^17 × 8 × 128 B = 128 MiB, about a second in a browser. */
export const SCRYPT = { N: 1 << 17, r: 8, p: 1 } as const;

const kdf = (seed: Uint8Array, info: string, length = 32) => hkdf(sha256, seed, utf8ToBytes(PROTOCOL), utf8ToBytes(info), length);

/**
 * Identity seed = HKDF(walletSignature ‖ scrypt(passphrase)). The wallet
 * signature is deterministic (RFC 8032), so the same wallet always re-derives
 * the same keys; the passphrase, when set, means a wallet compromise alone
 * does not reveal them.
 */
export async function deriveSeed(walletSignature: Uint8Array, wallet: string, passphrase: string, onProgress?: (p: number) => void): Promise<Uint8Array> {
  if (walletSignature.length !== 64) throw new Error("wallet signature must be 64 bytes");
  let stretched = new Uint8Array(0);
  if (passphrase) {
    stretched = await scryptAsync(utf8ToBytes(passphrase.normalize("NFKC")), utf8ToBytes(`${PROTOCOL}/passphrase/${wallet}`), {
      ...SCRYPT,
      dkLen: 32,
      onProgress,
      maxmem: 2 ** 28,
    });
  }
  return kdf(concatBytes(walletSignature, stretched), "identity-seed");
}

export type IdentityKeys = PublicIdentity & {
  address: string;
  skSeed: Uint8Array;
  /** Every tree level; levels[0] are the 256 leaves. Needed to sign with any leaf. */
  levels: Uint8Array[][];
  /** Kept to derive per-launch mint keypairs. */
  seed: Uint8Array;
};

/**
 * Generates all 256 one-time keys and the tree. ~257k SHA-256 calls; yields to
 * the event loop between batches so the page stays responsive.
 */
export async function generateIdentity(seed: Uint8Array, epoch = 0, onProgress?: (done: number, total: number) => void): Promise<IdentityKeys> {
  const skSeed = kdf(seed, `wots-secret/${epoch}`);
  const pubSeed = kdf(seed, `public-seed/${epoch}`);
  const leaves: Uint8Array[] = [];
  for (let i = 0; i < LEAVES; i++) {
    leaves.push(wotsLeaf(skSeed, pubSeed, epoch, i));
    if (i % 8 === 7) {
      onProgress?.(i + 1, LEAVES);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const levels = buildTree(pubSeed, epoch, leaves);
  const root = levels[HEIGHT][0];
  const pub: PublicIdentity = { root, pubSeed, height: HEIGHT, epoch };
  return { ...pub, address: pqAddress(pub), skSeed, levels, seed };
}

export function sign(keys: IdentityKeys, leaf: number, digest: Uint8Array): Signature {
  if (!Number.isInteger(leaf) || leaf < 0 || leaf >= LEAVES) throw new Error("leaf out of range");
  return { leaf, wots: wotsSign(digest, keys.skSeed, keys.pubSeed, keys.epoch, leaf), auth: authPath(keys.levels, leaf) };
}

/**
 * The mint keypair for the launch signed by `leaf`: derived, not random, so a
 * failed or interrupted launch retries with the same mint and nothing is lost.
 */
export function mintSecret(keys: IdentityKeys, leaf: number): { secretKey: Uint8Array; publicKey: Uint8Array } {
  const seed32 = kdf(keys.seed, `mint/${keys.epoch}/${bytesToHex(u32be(leaf))}`);
  const publicKey = ed25519.getPublicKey(seed32);
  return { secretKey: concatBytes(seed32, publicKey), publicKey };
}

export function publicOf(keys: IdentityKeys): { root: string; pubSeed: string; height: number; epoch: number; address: string } {
  return { root: bytesToHex(keys.root), pubSeed: bytesToHex(keys.pubSeed), height: keys.height, epoch: keys.epoch, address: keys.address };
}

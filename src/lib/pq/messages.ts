import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, u32be, utf8ToBytes } from "./bytes";
import { HEIGHT, PROTOCOL } from "./params";

/**
 * Every signed digest is SHA-256(protocol/tag ‖ 0x00 ‖ fields), each field
 * length-prefixed, so no message of one kind can be read as another and no two
 * field lists collide by shifting a boundary.
 */
export function taggedDigest(tag: string, fields: (string | number | Uint8Array)[]): Uint8Array {
  const parts: Uint8Array[] = [utf8ToBytes(`${PROTOCOL}/${tag}`), new Uint8Array([0])];
  for (const f of fields) {
    const bytes = typeof f === "number" ? u32be(f) : typeof f === "string" ? utf8ToBytes(f) : f;
    parts.push(u32be(bytes.length), bytes);
  }
  return sha256(concatBytes(...parts));
}

export const LIMITS = { name: 32, symbol: 10, description: 500, url: 200 } as const;

export type LaunchFields = {
  mint: string;
  /** The launching wallet: signer and fee payer of the create transaction. */
  creator: string;
  pqAddress: string;
  leaf: number;
  name: string;
  symbol: string;
  description: string;
  image: string;
  twitter: string;
  telegram: string;
};

/** What a one-time key signs to attest a launch. Every field is public in the coin's metadata. */
export function launchDigest(f: LaunchFields): Uint8Array {
  return taggedDigest("launch", [f.mint, f.creator, f.pqAddress, f.leaf, f.name, f.symbol, f.description, f.image, f.twitter, f.telegram]);
}

export function proveDigest(f: { pqAddress: string; challenge: string; leaf: number; note: string }): Uint8Array {
  return taggedDigest("prove", [f.pqAddress, f.challenge, f.leaf, f.note]);
}

export function registrationDigest(statement: string): Uint8Array {
  return taggedDigest("register", [statement]);
}

/**
 * Signed by the wallet (ed25519, deterministic) to derive the identity seed.
 * Deliberately brand- and domain-free: if it ever changed, every user would
 * derive different keys. That also means any site can ask for it, so the
 * wallet prompt says plainly what it is.
 */
export function seedMessage(wallet: string): string {
  return [
    "Post-quantum key derivation",
    "",
    "Signing this derives the hash-based (WOTS + Merkle) keys for this wallet.",
    "The signature IS key material. Only sign it on a launchpad you trust,",
    "and add a passphrase there for keys a wallet compromise cannot reach.",
    "",
    `Wallet: ${wallet}`,
    `Protocol: ${PROTOCOL}/seed`,
  ].join("\n");
}

/**
 * The statement that binds a wallet and an identity in both directions: the
 * wallet signs it with ed25519, the identity signs it with leaf 0.
 */
export function registrationStatement(f: { site: string; wallet: string; pqAddress: string; root: string; pubSeed: string; epoch: number }): string {
  return [
    `${f.site}: register post-quantum identity`,
    "",
    "This wallet and this hash-based identity belong to the same person.",
    "",
    `Wallet: ${f.wallet}`,
    `Identity: ${f.pqAddress}`,
    `Root: ${f.root}`,
    `Public seed: ${f.pubSeed}`,
    `Tree: height ${HEIGHT}, epoch ${f.epoch}`,
    `Protocol: ${PROTOCOL}`,
  ].join("\n");
}

/** SPL memo that timestamps an identity root on Solana while ed25519 still holds. */
export function anchorMemo(pqAddress: string, root: string): string {
  return `${PROTOCOL}:anchor:${pqAddress}:${root}`;
}

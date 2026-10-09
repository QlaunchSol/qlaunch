import { sha256 } from "@noble/hashes/sha2.js";
import { bech32m } from "@scure/base";
import { concatBytes, u32be, utf8ToBytes } from "./bytes";
import { PROTOCOL } from "./params";
import type { PublicIdentity } from "./signature";

const HRP = "pq";

/**
 * A post-quantum address is bech32m("pq", SHA-256(tag ‖ height ‖ epoch ‖ pubSeed ‖ root)):
 * the full 256-bit hash, so finding a second identity with the same address
 * costs 2^128 even for a quantum (Grover) attacker.
 */
export function pqAddress(identity: PublicIdentity): string {
  const hash = sha256(
    concatBytes(utf8ToBytes(`${PROTOCOL}/address`), new Uint8Array([0, identity.height]), u32be(identity.epoch), identity.pubSeed, identity.root),
  );
  return bech32m.encode(HRP, bech32m.toWords(hash), 90);
}

export function isPqAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 90) return false;
  try {
    const { prefix, words } = bech32m.decode(value as `${string}1${string}`, 90);
    return prefix === HRP && bech32m.fromWords(words).length === 32;
  } catch {
    return false;
  }
}

export function shortAddress(address: string, keep = 6): string {
  return address.length <= keep * 2 + 3 ? address : `${address.slice(0, keep + 3)}…${address.slice(-keep)}`;
}

export * from "./params";
export { isPqAddress, pqAddress, shortAddress } from "./address";
export { anchorMemo, launchDigest, LIMITS, proveDigest, registrationDigest, registrationStatement, seedMessage, taggedDigest, type LaunchFields } from "./messages";
export {
  decodeSignature,
  encodeSignature,
  signatureFromBase64,
  signatureToBase64,
  verify,
  type PublicIdentity,
  type Signature,
  type VerifyTrace,
} from "./signature";
export { bytesToHex, hexToBytes, isHex } from "./bytes";

import { hexToBytes, isHex } from "./bytes";
import type { PublicIdentity } from "./signature";

/** Parses the hex form stored in the database and published in coin metadata. */
export function identityFromHex(v: { root: unknown; pubSeed: unknown; height: unknown; epoch?: unknown }): PublicIdentity | null {
  if (!isHex(v.root, 32) || !isHex(v.pubSeed, 32) || typeof v.height !== "number") return null;
  const epoch = v.epoch ?? 0;
  if (typeof epoch !== "number" || !Number.isInteger(epoch) || epoch < 0) return null;
  return { root: hexToBytes(v.root), pubSeed: hexToBytes(v.pubSeed), height: v.height, epoch };
}

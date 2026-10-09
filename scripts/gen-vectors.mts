/** Writes test vectors that independent verifiers (scripts/verify.py) must accept and reject. */
import { writeFileSync } from "node:fs";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "../src/lib/pq/bytes.ts";
import { generateIdentity, sign } from "../src/lib/pq/keys.ts";
import { launchDigest, type LaunchFields } from "../src/lib/pq/messages.ts";
import { signatureToBase64 } from "../src/lib/pq/signature.ts";

const keys = await generateIdentity(sha256(utf8ToBytes("vector identity")));
const fields: LaunchFields = {
  mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  creator: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  pqAddress: keys.address,
  leaf: 17,
  name: "Vector Coin ✓",
  symbol: "VEC",
  description: "Multi-byte UTF-8: ünïcödé, 日本語, emoji 🚀",
  image: "https://example.com/ipfs/bafy",
  twitter: "https://x.com/example",
  telegram: "",
};
const digest = launchDigest(fields);
const sig = sign(keys, fields.leaf, digest);
const identity = { address: keys.address, root: bytesToHex(keys.root), pubSeed: bytesToHex(keys.pubSeed), height: keys.height, epoch: keys.epoch };
const valid = { identity, fields, digest: bytesToHex(digest), signature: signatureToBase64(sig), expect: true };
const vectors = [
  valid,
  { ...valid, fields: { ...fields, symbol: "VEC2" }, digest: bytesToHex(launchDigest({ ...fields, symbol: "VEC2" })), expect: false },
  { ...valid, identity: { ...identity, root: "00".repeat(32) }, expect: false },
];
writeFileSync(new URL("./vectors/launch.json", import.meta.url), JSON.stringify(vectors, null, 2) + "\n");
console.log("wrote", vectors.length, "vectors; address", keys.address);

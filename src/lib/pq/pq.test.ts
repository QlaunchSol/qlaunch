import { sha256 } from "@noble/hashes/sha2.js";
import { beforeAll, describe, expect, it } from "vitest";
import { bytesToHex, utf8ToBytes } from "./bytes";
import { deriveSeed, generateIdentity, mintSecret, sign, type IdentityKeys } from "./keys";
import {
  SIGNATURE_BYTES,
  decodeSignature,
  encodeSignature,
  isPqAddress,
  launchDigest,
  pqAddress,
  signatureFromBase64,
  signatureToBase64,
  taggedDigest,
  verify,
} from "./index";
import { encodeDigest } from "./wots";

const fixedSeed = sha256(utf8ToBytes("test identity seed"));
let keys: IdentityKeys;
let other: IdentityKeys;

beforeAll(async () => {
  keys = await generateIdentity(fixedSeed);
  other = await generateIdentity(sha256(utf8ToBytes("someone else")));
}, 60_000);

const launch = {
  mint: "Mint1111111111111111111111111111111111111111",
  creator: "Wallet111111111111111111111111111111111111111",
  pqAddress: "pq1test",
  leaf: 3,
  name: "Test Coin",
  symbol: "TEST",
  description: "",
  image: "https://example.com/a.png",
  twitter: "",
  telegram: "",
};

describe("WOTS encoding", () => {
  it("produces 67 base-16 digits with a correct checksum", () => {
    const d = encodeDigest(new Uint8Array(32));
    expect(d).toHaveLength(67);
    expect(d.slice(0, 64).every((x) => x === 0)).toBe(true);
    // checksum 64 * 15 = 960 = 0x3c0 → digits 3, c, 0
    expect(d.slice(64)).toEqual([3, 12, 0]);
    const ff = encodeDigest(new Uint8Array(32).fill(0xff));
    expect(ff.slice(64)).toEqual([0, 0, 0]);
  });
});

describe("identity", () => {
  it("is deterministic", async () => {
    const again = await generateIdentity(fixedSeed);
    expect(bytesToHex(again.root)).toBe(bytesToHex(keys.root));
    expect(again.address).toBe(keys.address);
  }, 60_000);

  it("has a valid pq1 address", () => {
    expect(keys.address.startsWith("pq1")).toBe(true);
    expect(isPqAddress(keys.address)).toBe(true);
    expect(isPqAddress(keys.address.slice(0, -1) + (keys.address.endsWith("q") ? "p" : "q"))).toBe(false);
    expect(pqAddress(keys)).toBe(keys.address);
    expect(keys.address).not.toBe(other.address);
  });

  it("derives a stable seed and a different one with a passphrase", async () => {
    const sig = new Uint8Array(64).fill(7);
    const a = await deriveSeed(sig, "W", "");
    const b = await deriveSeed(sig, "W", "");
    expect(bytesToHex(a)).toBe(bytesToHex(b));
    const c = await deriveSeed(sig, "W", "correct horse");
    expect(bytesToHex(c)).not.toBe(bytesToHex(a));
  }, 60_000);

  it("derives distinct, stable mint keys per leaf", () => {
    const m1 = mintSecret(keys, 1);
    expect(bytesToHex(mintSecret(keys, 1).publicKey)).toBe(bytesToHex(m1.publicKey));
    expect(bytesToHex(mintSecret(keys, 2).publicKey)).not.toBe(bytesToHex(m1.publicKey));
    expect(m1.secretKey).toHaveLength(64);
  });
});

describe("sign / verify", () => {
  it("round-trips on every leaf position class", () => {
    for (const leaf of [0, 1, 2, 127, 128, 254, 255]) {
      const digest = launchDigest({ ...launch, leaf });
      const sig = sign(keys, leaf, digest);
      const trace = verify(digest, sig, keys);
      expect(trace.valid).toBe(true);
      expect(trace.path).toHaveLength(8);
      expect(trace.computedRoot).toBe(bytesToHex(keys.root));
    }
  });

  it("serializes to exactly 2,404 bytes and back", () => {
    const digest = launchDigest(launch);
    const sig = sign(keys, launch.leaf, digest);
    expect(encodeSignature(sig)).toHaveLength(SIGNATURE_BYTES);
    expect(SIGNATURE_BYTES).toBe(2404);
    const back = signatureFromBase64(signatureToBase64(sig))!;
    expect(back.leaf).toBe(sig.leaf);
    expect(verify(digest, back, keys).valid).toBe(true);
  });

  it("rejects a different message", () => {
    const sig = sign(keys, 3, launchDigest(launch));
    expect(verify(launchDigest({ ...launch, name: "Test Coin!" }), sig, keys).valid).toBe(false);
    expect(verify(launchDigest({ ...launch, mint: launch.mint.replace("1", "2") }), sig, keys).valid).toBe(false);
  });

  it("rejects another identity's root", () => {
    const digest = launchDigest(launch);
    expect(verify(digest, sign(keys, 3, digest), other).valid).toBe(false);
  });

  it("rejects a signature moved to a different leaf index", () => {
    const digest = launchDigest(launch);
    const sig = sign(keys, 3, digest);
    expect(verify(digest, { ...sig, leaf: 4 }, keys).valid).toBe(false);
  });

  it("rejects any single flipped bit", () => {
    const digest = launchDigest(launch);
    const bytes = encodeSignature(sign(keys, 3, digest));
    for (const pos of [4, 100, 2147, 4 + 2144 + 5, 2403]) {
      const bad = bytes.slice();
      bad[pos] ^= 1;
      expect(verify(digest, decodeSignature(bad), keys).valid).toBe(false);
    }
  });

  it("rejects malformed encodings", () => {
    expect(signatureFromBase64("AAAA")).toBeNull();
    expect(signatureFromBase64(42)).toBeNull();
    const bytes = encodeSignature(sign(keys, 3, launchDigest(launch)));
    bytes[0] = 1; // leaf index ≥ 256
    expect(() => decodeSignature(bytes)).toThrow();
  });
});

describe("domain separation", () => {
  it("separates tags and field boundaries", () => {
    expect(bytesToHex(taggedDigest("a", ["bc"]))).not.toBe(bytesToHex(taggedDigest("a", ["b", "c"])));
    expect(bytesToHex(taggedDigest("launch", ["x"]))).not.toBe(bytesToHex(taggedDigest("prove", ["x"])));
  });

  it("matches pinned vectors (format must never drift)", () => {
    expect(bytesToHex(launchDigest(launch))).toMatchInlineSnapshot(`"8d3c8fbd9273c93a95a12278fd70d7869f2e0a692bf65d8e79e21bfc71cb9a2c"`);
    expect(keys.address).toMatchInlineSnapshot(`"pq1agj679gn6tuekedzr2xf0p7qs4xynmn2eujvs5pgm24ytts3sjqqgsvq6s"`);
    expect(bytesToHex(keys.root)).toMatchInlineSnapshot(`"27077ec9ca201ef6f4af5f9d149b8b427e2b54867082d28c41f68d7046bc6297"`);
  });
});

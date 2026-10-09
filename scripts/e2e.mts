/**
 * End-to-end test against a running server on devnet: identity → register →
 * anchor → upload → launch on pump.fun → verify (TypeScript and Python) →
 * proof of possession, plus the refusals that keep one-time keys one-time.
 *
 *   BASE_URL=http://127.0.0.1:3000 RPC_URL=https://api.devnet.solana.com \
 *   WALLET=/path/to/devnet-wallet.json npx tsx scripts/e2e.mts
 *
 * The wallet file is created (and airdropped devnet SOL) if missing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { ed25519 } from "@noble/curves/ed25519.js";
import { Connection, Keypair, LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { bytesToHex, fromBase64, toBase64, utf8ToBytes } from "../src/lib/pq/bytes.ts";
import { deriveSeed, generateIdentity, mintSecret, sign } from "../src/lib/pq/keys.ts";
import { launchDigest, proveDigest, registrationDigest, registrationStatement, seedMessage } from "../src/lib/pq/messages.ts";
import { signatureToBase64 } from "../src/lib/pq/signature.ts";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const SITE = process.env.SITE_NAME ?? "Hashmint";
const WALLET = process.env.WALLET ?? "/tmp/e2e-wallet.json";
const PASSPHRASE = "e2e correct horse battery";

let failures = 0;
const ok = (cond: unknown, what: string) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${what}`);
  if (!cond) failures++;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call<T = any>(path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(BASE + path, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => null)) as T };
}

function wallet(): Keypair {
  if (existsSync(WALLET)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(WALLET, "utf8"))));
  const kp = Keypair.generate();
  writeFileSync(WALLET, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return kp;
}

const signText = (kp: Keypair, text: string) => ed25519.sign(utf8ToBytes(text), kp.secretKey.slice(0, 32));

/** A 64×64 PNG with a random color, so every run uploads a distinct image. */
function png(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0);
  ihdr.writeUInt32BE(64, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const rgb = [0, 0, 0].map(() => Math.floor(Math.random() * 255));
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 64 * 3 }, (_, i) => rgb[i % 3]))]);
  const raw = Buffer.concat(Array.from({ length: 64 }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function main() {
  const kp = wallet();
  const addr = kp.publicKey.toBase58();
  const conn = new Connection(RPC, "confirmed");
  console.log(`wallet ${addr}`);

  let balance = await conn.getBalance(kp.publicKey);
  if (balance < 0.3 * LAMPORTS_PER_SOL) {
    console.log("requesting devnet airdrop…");
    const sig = await conn.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
    balance = await conn.getBalance(kp.publicKey);
  }
  console.log(`balance ${balance / LAMPORTS_PER_SOL} SOL`);

  console.log("identity");
  const seed = await deriveSeed(signText(kp, seedMessage(addr)), addr, PASSPHRASE);
  const keys = await generateIdentity(seed);
  const root = bytesToHex(keys.root);
  const pubSeed = bytesToHex(keys.pubSeed);
  console.log(`  ${keys.address}`);

  const statement = registrationStatement({ site: SITE, wallet: addr, pqAddress: keys.address, root, pubSeed, epoch: 0 });
  const regBody = { wallet: addr, root, pubSeed, statement, walletSignature: bs58.encode(signText(kp, statement)), signature: signatureToBase64(sign(keys, 0, registrationDigest(statement))) };

  const badReg = await call("/api/identity/register", { ...regBody, walletSignature: bs58.encode(new Uint8Array(64)) });
  ok(badReg.status === 400 || badReg.status === 200, `forged wallet signature refused or identity already registered (${badReg.status} ${badReg.json?.error ?? ""})`);
  const reg = await call("/api/identity/register", regBody);
  ok(reg.status === 201 || reg.status === 200, `registered (${reg.status} ${reg.json?.error ?? ""})`);
  const again = await call("/api/identity/register", regBody);
  ok(again.status === 200, "re-registering the same identity is idempotent");
  const other = await generateIdentity(await deriveSeed(signText(kp, seedMessage(addr)), addr, "a different passphrase"));
  const otherStatement = registrationStatement({ site: SITE, wallet: addr, pqAddress: other.address, root: bytesToHex(other.root), pubSeed: bytesToHex(other.pubSeed), epoch: 0 });
  const clash = await call("/api/identity/register", {
    wallet: addr,
    root: bytesToHex(other.root),
    pubSeed: bytesToHex(other.pubSeed),
    statement: otherStatement,
    walletSignature: bs58.encode(signText(kp, otherStatement)),
    signature: signatureToBase64(sign(other, 0, registrationDigest(otherStatement))),
  });
  ok(clash.status === 409, `a second identity for the same wallet is refused (${clash.status})`);

  console.log("anchor");
  const detail0 = await call(`/api/identity?wallet=${addr}`);
  if (!detail0.json?.identity?.anchor) {
    const prep = await call("/api/identity/anchor", { wallet: addr });
    ok(prep.status === 200 && prep.json.transaction, `anchor transaction built (${prep.status} ${prep.json?.error ?? ""})`);
    const tx = VersionedTransaction.deserialize(fromBase64(prep.json.transaction));
    tx.sign([kp]);
    const anchored = await call("/api/identity/anchor", { wallet: addr, transaction: toBase64(tx.serialize()) });
    ok(anchored.status === 200 && anchored.json?.identity?.anchor?.slot, `anchored in slot ${anchored.json?.identity?.anchor?.slot} (${anchored.status} ${anchored.json?.error ?? ""})`);
  } else ok(true, "already anchored");

  console.log("upload");
  const form = new FormData();
  form.append("file", new Blob([png()], { type: "image/png" }), "coin.png");
  const up = await fetch(`${BASE}/api/upload`, { method: "POST", body: form }).then(async (r) => ({ status: r.status, json: await r.json() }));
  ok(up.status === 200 && up.json.url, `image stored at ${up.json.url ?? up.json.error}`);
  const bogus = new FormData();
  bogus.append("file", new Blob([Buffer.from("<script>alert(1)</script>".repeat(10))], { type: "image/png" }), "x.png");
  const bogusUp = await fetch(`${BASE}/api/upload`, { method: "POST", body: bogus });
  ok(bogusUp.status === 400, "non-image upload refused by magic bytes");

  console.log("launch");
  const used = new Set<number>(((await call(`/api/identity?wallet=${addr}`)).json.usedLeaves ?? []).map((u: { leaf: number }) => u.leaf));
  const leaf = [...Array(256).keys()].find((i) => i > 0 && !used.has(i))!;
  const mint = Keypair.fromSecretKey(mintSecret(keys, leaf).secretKey);
  const form2 = { name: `E2E Coin ${leaf}`, symbol: `E2E${leaf}`, description: "End-to-end test coin. Ünïcödé ✓", image: up.json.url, twitter: "https://x.com/example", telegram: "" };
  const fields = { mint: mint.publicKey.toBase58(), creator: addr, pqAddress: keys.address, leaf, ...form2 };
  const digest = launchDigest(fields);
  const signature = signatureToBase64(sign(keys, leaf, digest));
  const body = { wallet: addr, mint: fields.mint, ...form2, devBuySol: 0.01, signature, digest: bytesToHex(digest) };

  const tampered = await call("/api/launch/prepare", { ...body, name: "Tampered" });
  ok(tampered.status === 400, `tampered field refused before the key is spent (${tampered.json?.error})`);

  const prep = await call("/api/launch/prepare", body);
  ok(prep.status === 200 && prep.json.transaction, `launch prepared with key #${leaf} (${prep.status} ${prep.json?.error ?? ""})`);
  const retry = await call("/api/launch/prepare", body);
  ok(retry.status === 200, `retrying the identical launch reuses its key (${retry.status} ${retry.json?.error ?? ""})`);
  const reuseDigest = launchDigest({ ...fields, name: "Reuse attempt" });
  const reuse = await call("/api/launch/prepare", { ...body, name: "Reuse attempt", digest: bytesToHex(reuseDigest), signature: signatureToBase64(sign(keys, leaf, reuseDigest)) });
  ok(reuse.status === 409, `signing different details with a spent key is refused (${reuse.status})`);

  const tx = VersionedTransaction.deserialize(fromBase64(prep.json.transaction));
  tx.sign([kp, mint]);
  let sub = await call("/api/launch/submit", { mint: fields.mint, transaction: toBase64(tx.serialize()) });
  for (let i = 0; sub.json?.status !== "live" && i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    sub = await call("/api/launch/submit", { mint: fields.mint });
  }
  ok(sub.json?.status === "live", `coin live: ${fields.mint} (${sub.json?.signature ?? sub.json?.error})`);

  console.log("read back");
  const token = await call(`/api/token/${fields.mint}`);
  ok(token.status === 200 && token.json.coin?.name === form2.name, "coin detail served");
  ok(token.json?.identity?.address === keys.address, "coin linked to the identity");
  const list = await call(`/api/launches?sort=new`);
  ok(list.json?.coins?.some((c: { mint: string }) => c.mint === fields.mint), "coin listed on the grid");
  const meta = await call(`/api/token/${fields.mint}/metadata`);
  ok(meta.json?.pq?.digest === bytesToHex(digest), "metadata carries the attestation");

  console.log("independent verifier (python)");
  const py = (() => {
    try {
      return execFileSync("python3", ["-I", "scripts/verify.py", `${BASE}/coin/${fields.mint}`], { encoding: "utf8" });
    } catch (e) {
      return String((e as { stdout?: string }).stdout ?? e);
    }
  })();
  ok(py.includes("VALID:"), `python: ${py.trim().split("\n").at(-1)}`);

  console.log("proof of possession");
  const ch = await call("/api/prove/challenge", { address: keys.address });
  const pleaf = leaf + 1;
  const note = "e2e proof";
  const psig = signatureToBase64(sign(keys, pleaf, proveDigest({ pqAddress: keys.address, challenge: ch.json.challenge, leaf: pleaf, note })));
  const proved = await call("/api/prove/verify", { address: keys.address, challenge: ch.json.challenge, note, signature: psig });
  ok(proved.status === 201, `proof recorded ${proved.json?.id ?? proved.json?.error}`);
  const replay = await call("/api/prove/verify", { address: keys.address, challenge: ch.json.challenge, note, signature: psig });
  ok(replay.status === 410, `replayed challenge refused (${replay.status})`);
  const proof = await call(`/api/prove/${proved.json?.id}`);
  ok(proof.json?.proof?.leaf === pleaf, "proof readable");

  console.log("market data");
  const listed = (await call(`/api/launches?sort=mcap`)).json?.coins?.find((c: { mint: string }) => c.mint === fields.mint);
  ok(listed && listed.marketCapUsd > 0, `market cap from the bonding curve: $${listed?.marketCapUsd?.toFixed(2)}, progress ${listed?.progress}`);

  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

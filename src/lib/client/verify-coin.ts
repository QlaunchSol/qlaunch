import { ed25519 } from "@noble/curves/ed25519.js";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { site } from "@/config/site";
import {
  PROTOCOL,
  REGISTRATION_LEAF,
  bytesToHex,
  identityFromHex,
  launchDigest,
  pqAddress,
  registrationDigest,
  signatureFromBase64,
  verify,
  type VerifyTrace,
} from "@/lib/pq";
import { fromBase64 } from "@/lib/pq/bytes";
import type { TokenDetail } from "@/lib/types";

export type Step = { id: string; title: string; ok: boolean | null; detail: string };
/** valid: every check passed. invalid: something doesn't match. unknown: a check couldn't run (network). */
export type Verdict = "valid" | "invalid" | "unknown";
export type CoinVerification = { steps: Step[]; trace: VerifyTrace | null; verdict: Verdict };

type Metadata = {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  twitter?: string;
  telegram?: string;
  pq?: {
    protocol?: string;
    mint?: string;
    creator?: string;
    leaf?: number;
    identity?: { address?: string; root?: string; pubSeed?: string; height?: number; epoch?: number };
    digest?: string;
    signature?: string;
  };
};

const PUBLIC_RPC = site.cluster === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com";

/**
 * The mint's own Token-2022 metadata (name, symbol, uri), read straight from a
 * public Solana RPC rather than through this site: the chain is the source of
 * truth for which metadata a coin points at. Null if it can't be read.
 */
async function onChainMetadata(mint: string): Promise<{ name: string; symbol: string; uri: string } | null> {
  try {
    const res = await fetch(PUBLIC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "base64", commitment: "confirmed" }] }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json())?.result?.value?.data?.[0];
    return typeof data === "string" ? parseTokenMetadata(fromBase64(data)) : null;
  } catch {
    return null;
  }
}

/** Token-2022 mint account → its TokenMetadata extension's name, symbol and uri (null if absent). */
export function parseTokenMetadata(bytes: Uint8Array): { name: string; symbol: string; uri: string } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 82-byte base mint, padding to 165, account type byte, then TLV extensions.
  for (let at = 166; at + 4 <= bytes.length; ) {
    const type = view.getUint16(at, true);
    const len = view.getUint16(at + 2, true);
    if (type === 19) {
      // TokenMetadata: update authority (32), mint (32), then three borsh strings.
      let p = at + 4 + 64;
      const str = () => {
        const n = view.getUint32(p, true);
        const s = new TextDecoder().decode(bytes.subarray(p + 4, p + 4 + n));
        p += 4 + n;
        return s;
      };
      return { name: str(), symbol: str(), uri: str() };
    }
    at += 4 + len;
  }
  return null;
}

/**
 * Verifies a coin entirely in the browser: on-chain metadata pointer → IPFS
 * metadata → digest → WOTS chains → Merkle root → registered identity → its
 * registration signatures → the registry's record of the key. Every step is
 * reported. Only SHA-256 (and ed25519 for the wallet binding) is used.
 */
export async function verifyCoin(detail: TokenDetail): Promise<CoinVerification> {
  const steps: Step[] = [];
  const add = (id: string, title: string, ok: boolean | null, text: string) => steps.push({ id, title, ok, detail: text });
  const coin = detail.coin!;
  const mint = coin.mint;
  const identity = detail.identity;
  let trace: VerifyTrace | null = null;
  const done = (): CoinVerification => ({
    steps,
    trace,
    verdict: steps.some((s) => s.ok === false) ? "invalid" : steps.some((s) => s.ok === null && s.id !== "anchor") ? "unknown" : "valid",
  });

  const chain = await onChainMetadata(mint);
  if (!chain) add("chain", "Read the coin's metadata pointer on chain", null, "Couldn't reach a public Solana node right now; using the site's record of the URI.");
  else {
    const same = chain.uri === coin.metadataUri && chain.name === coin.name && chain.symbol === coin.symbol;
    add("chain", "Read the coin's metadata pointer on chain", same, same ? `On-chain name, ticker and metadata URI match` : `On chain this coin is “${chain.name}” ($${chain.symbol}) at ${chain.uri}`);
  }

  let meta: Metadata;
  try {
    const res = await fetch(`/api/token/${mint}/metadata`);
    if (!res.ok) throw new Error(String(res.status));
    meta = (await res.json()) as Metadata;
  } catch {
    add("metadata", "Fetch the coin's metadata", null, "The metadata couldn't be fetched from IPFS right now. Try again in a moment.");
    return done();
  }
  const pq = meta.pq;
  add("metadata", "Fetch the coin's metadata", Boolean(pq), pq ? `Pinned on IPFS at ${coin.metadataUri}` : "The metadata carries no post-quantum attestation.");
  if (!pq) return done();

  const displayed =
    meta.name === coin.name &&
    meta.symbol === coin.symbol &&
    (meta.description ?? "") === coin.description &&
    meta.image === coin.image &&
    (meta.twitter ?? "") === coin.twitter &&
    (meta.telegram ?? "") === coin.telegram;
  add("display", "This page shows the signed details", displayed, displayed ? "Name, ticker, description, image and links are exactly what was signed" : "Something on this page differs from the signed metadata.");

  const protocolOk = pq.protocol === PROTOCOL && pq.mint === mint;
  add("protocol", "Attestation is for this coin", protocolOk, protocolOk ? `${PROTOCOL}, mint ${mint}` : "The attestation names a different coin or protocol.");

  const id = identityFromHex({ root: pq.identity?.root, pubSeed: pq.identity?.pubSeed, height: pq.identity?.height, epoch: pq.identity?.epoch });
  const address = pq.identity?.address ?? "";
  const addressOk = Boolean(id && pqAddress(id) === address && address === coin.pqAddress);
  add("address", "Identity address matches its root", addressOk, addressOk ? `${address} = H(pubSeed ‖ root)` : "The address isn't derived from the root in the metadata.");

  const leaf = typeof pq.leaf === "number" && Number.isInteger(pq.leaf) ? pq.leaf : -1;
  const digest = launchDigest({
    mint,
    creator: pq.creator ?? "",
    pqAddress: address,
    leaf: leaf >= 0 ? leaf : 0,
    name: meta.name ?? "",
    symbol: meta.symbol ?? "",
    description: meta.description ?? "",
    image: meta.image ?? "",
    twitter: meta.twitter ?? "",
    telegram: meta.telegram ?? "",
  });
  const digestOk = bytesToHex(digest) === pq.digest && pq.creator === coin.creator;
  add("digest", "Rebuild the signed digest from public fields", digestOk, digestOk ? bytesToHex(digest) : "The metadata's fields don't hash to the signed digest: something was changed.");

  const sig = signatureFromBase64(pq.signature);
  if (!sig || !id || sig.leaf !== leaf || leaf === REGISTRATION_LEAF) {
    add("signature", "Verify the one-time signature", false, leaf === REGISTRATION_LEAF ? "Key #0 is reserved for registration and can't sign a launch." : "The signature is missing or malformed.");
    return done();
  }
  trace = verify(digest, sig, id);
  add(
    "signature",
    "Verify the one-time signature",
    trace.valid,
    trace.valid ? `Key #${sig.leaf}: ${trace.steps} hash steps along 67 chains, then 8 tree levels to the root.` : "The signature does not lead to this identity's root.",
  );

  const keyUse = detail.keyUse;
  const keyOk = keyUse?.purpose === "launch" && keyUse.ref === mint && keyUse.digest === pq.digest;
  add("key", "The registry records this key for this coin", keyOk, keyOk ? `Key #${leaf} is spent on this launch and nothing else` : "The registry has no matching record of this one-time key.");

  let registryOk: boolean | null = null;
  let text = "This identity isn't in the registry.";
  if (identity) {
    registryOk = identity.root === pq.identity?.root && identity.pubSeed === pq.identity?.pubSeed && identity.address === address;
    text = registryOk ? `Registered to wallet ${identity.wallet}` : "The registry holds a different root for this address.";
  }
  add("registry", "Identity is registered", registryOk ?? false, text);

  if (identity && registryOk) {
    let walletOk = false;
    try {
      walletOk = ed25519.verify(bs58.decode(identity.walletSignature), new TextEncoder().encode(identity.statement), new PublicKey(identity.wallet).toBytes());
    } catch {}
    const regSig = signatureFromBase64(identity.registrationSignature);
    const leaf0Ok = Boolean(regSig && regSig.leaf === REGISTRATION_LEAF && verify(registrationDigest(identity.statement), regSig, id).valid);
    const statementOk = identity.statement.includes(`Identity: ${address}`) && identity.statement.includes(`Wallet: ${identity.wallet}`);
    add(
      "binding",
      "Wallet and identity signed each other",
      walletOk && leaf0Ok && statementOk && identity.wallet === coin.creator,
      walletOk && leaf0Ok && statementOk ? "ed25519 signature by the wallet and one-time key #0 over the same statement." : "The registration statement's signatures don't check out.",
    );
    add(
      "anchor",
      "Root anchored on Solana",
      identity.anchor ? true : null,
      identity.anchor ? `Memo in slot ${identity.anchor.slot ?? "?"} (as recorded by this site; check the transaction on an explorer)` : "Not anchored (optional).",
    );
  }
  return done();
}

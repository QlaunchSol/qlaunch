import "server-only";
import { bondingCurvePda, getBuyTokenAmountFromSolAmount } from "@pump-fun/pump-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { coinUrl, site } from "@/config/site";
import { PROTOCOL, type LaunchFields } from "@/lib/pq";
import { setFailed, setLive, type IdentityRow, type LaunchRow } from "./db";
import { verifyLaunchOnChain } from "./onchain";
import { emitLaunch } from "./events";
import { env } from "./env";
import { LAMPORTS_PER_SOL, connection, pumpSdk, pumpState } from "./solana";
import { bad } from "./http";
import { launchLookupTable } from "./lookup";
import { compileTx } from "./tx";

export const MAX_DEV_BUY_SOL = 20;

/** The coin's IPFS metadata: pump.fun's fields plus the attestation under "pq". */
export function launchMetadata(f: LaunchFields, identity: IdentityRow, digest: string, signature: string) {
  return {
    name: f.name,
    symbol: f.symbol,
    description: f.description,
    image: f.image,
    showName: true,
    createdOn: site.url,
    website: coinUrl(f.mint),
    ...(f.twitter && { twitter: f.twitter }),
    ...(f.telegram && { telegram: f.telegram }),
    pq: {
      protocol: PROTOCOL,
      scheme: "WOTS+(w=16, SHA-256) + Merkle(h=8)",
      mint: f.mint,
      creator: f.creator,
      leaf: f.leaf,
      identity: { address: identity.pq_address, root: identity.root, pubSeed: identity.pub_seed, height: identity.height, epoch: identity.epoch },
      anchor: identity.anchor_tx,
      digest,
      signature,
      verify: coinUrl(f.mint),
    },
  };
}

/**
 * create_v2 (+ first buy) for a SOL-quoted coin. The platform treasury is the
 * on-chain creator, so pump.fun's creator fees accrue to it; the launching
 * wallet signs and pays. Disclosed on the launch form and in the docs.
 */
export async function buildLaunchTx(p: { wallet: string; mint: string; name: string; symbol: string; uri: string; devBuySol: number }) {
  const user = new PublicKey(p.wallet);
  const mint = new PublicKey(p.mint);
  const creator = new PublicKey(env.treasury());
  const base = { mint, name: p.name, symbol: p.symbol, uri: p.uri, creator, user, mayhemMode: false };
  const table = await launchLookupTable();
  const tables = table ? [table] : [];
  if (p.devBuySol <= 0) {
    return (await compileTx(user, [await pumpSdk.createV2Instruction(base)], 200_000, tables)) ?? bad("Transaction too large");
  }
  const { global, feeConfig } = await pumpState();
  const solAmount = new BN(Math.round(p.devBuySol * LAMPORTS_PER_SOL));
  const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: solAmount, quoteMint: NATIVE_MINT });
  const ixs = await pumpSdk.createV2AndBuyInstructions({ ...base, global, amount, solAmount });
  const tx = await compileTx(user, ixs, 350_000, tables);
  if (tx) return tx;
  return bad(
    table
      ? "This launch doesn't fit in one transaction. Try a shorter name or ticker."
      : "Dev buys aren't available yet on this server (it needs its lookup table configured). Launch without a dev buy, or try again later.",
    table ? 400 : 503,
  );
}

/** The coin exists once its bonding curve account does. */
export async function curveExists(mint: string): Promise<boolean> {
  return (await connection().getAccountInfo(bondingCurvePda(new PublicKey(mint)))) !== null;
}

/**
 * Lists a launch only once chain agrees with its attestation (see onchain.ts).
 * Returns the resulting status; a definitive mismatch fails the launch for good.
 */
export async function confirmLaunch(launch: LaunchRow, knownSignature?: string | null): Promise<"live" | "pending" | "failed"> {
  if (launch.status === "live") return "live";
  const check = await verifyLaunchOnChain(launch, knownSignature);
  if (check.ok) {
    if (await setLive(launch.mint, check.signature, check.devTokens)) emitLaunch(launch.mint);
    return "live";
  }
  if (check.final) {
    console.warn(`launch ${launch.mint} rejected: ${check.reason}`);
    await setFailed(launch.mint, check.reason);
    return "failed";
  }
  return "pending";
}

/** The metadata URI's exact final length (gateway + CIDv1 raw, 59 chars): lets preflight size the transaction before anything is pinned. */
export const placeholderUri = () => `https://${env.pinataGateway()}/ipfs/bafkrei${"a".repeat(52)}`;

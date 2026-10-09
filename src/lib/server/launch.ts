import "server-only";
import { bondingCurvePda, getBuyTokenAmountFromSolAmount } from "@pump-fun/pump-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { coinUrl, site } from "@/config/site";
import { PROTOCOL, type LaunchFields } from "@/lib/pq";
import { db, maybe, ok, type IdentityRow, type LaunchRow } from "./db";
import { env } from "./env";
import { LAMPORTS_PER_SOL, connection, pumpSdk, pumpState } from "./solana";
import { buildTx } from "./tx";

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
  if (p.devBuySol <= 0) {
    return buildTx(user, [await pumpSdk.createV2Instruction(base)], 200_000);
  }
  const { global, feeConfig } = await pumpState();
  const solAmount = new BN(Math.round(p.devBuySol * LAMPORTS_PER_SOL));
  const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: solAmount, quoteMint: NATIVE_MINT });
  const ixs = await pumpSdk.createV2AndBuyInstructions({ ...base, global, amount, solAmount });
  return buildTx(user, ixs, 350_000);
}

/** The coin exists once its bonding curve account does. */
export async function curveExists(mint: string): Promise<boolean> {
  return (await connection().getAccountInfo(bondingCurvePda(new PublicKey(mint)))) !== null;
}

export async function markLive(mint: string, txSignature: string | null) {
  const row = maybe(await db().from("launches").select("status").eq("mint", mint).maybeSingle<Pick<LaunchRow, "status">>());
  if (!row || row.status === "live") return;
  ok(
    await db()
      .from("launches")
      .update({ status: "live", tx_signature: txSignature, launched_at: new Date().toISOString() })
      .eq("mint", mint)
      .neq("status", "live"),
  );
}

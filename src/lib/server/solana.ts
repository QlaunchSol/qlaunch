import "server-only";
import { OnlinePumpSdk, PUMP_SDK, type FeeConfig, type Global } from "@pump-fun/pump-sdk";
import { Connection, PublicKey, type VersionedTransactionResponse } from "@solana/web3.js";
import { cached } from "./cache";
import { env } from "./env";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const LAMPORTS_PER_SOL = 1_000_000_000;

let conn: Connection | null = null;
export function connection(): Connection {
  if (!conn) conn = new Connection(env.rpcUrl(), { commitment: "confirmed", disableRetryOnRateLimit: false });
  return conn;
}

let online: OnlinePumpSdk | null = null;
export function onlinePump(): OnlinePumpSdk {
  if (!online) online = new OnlinePumpSdk(connection());
  return online;
}

export const pumpSdk = PUMP_SDK;

/**
 * pump.fun's Global and FeeConfig accounts change rarely; a minute of caching
 * keeps every launch from re-reading them. BN fields don't survive JSON, so
 * this cache is in-process only.
 */
let globalCache: { at: number; value: Promise<{ global: Global; feeConfig: FeeConfig | null }> } | null = null;
export function pumpState(): Promise<{ global: Global; feeConfig: FeeConfig | null }> {
  if (!globalCache || Date.now() - globalCache.at > 60_000) {
    const value = Promise.all([onlinePump().fetchGlobal(), onlinePump().fetchFeeConfig().catch(() => null)]).then(([global, feeConfig]) => ({ global, feeConfig }));
    value.catch(() => (globalCache = null));
    globalCache = { at: Date.now(), value };
  }
  return globalCache.value;
}

export async function getTransaction(signature: string): Promise<VersionedTransactionResponse | null> {
  return connection().getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
}

/** Latest blockhash, shared for a few seconds across requests. */
export function recentBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  return cached("solana:blockhash", 5_000, () => connection().getLatestBlockhash("confirmed"));
}

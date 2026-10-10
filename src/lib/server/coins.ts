import "server-only";
import { cached } from "./cache";
import { coinByMint, coinPage, counts, identityByAddress, type CoinRow } from "./db";
import type { Coin, CoinList, PlatformStats, TokenDetail } from "@/lib/types";
import { identityJson } from "./identity";

const SORTS = ["new", "mcap", "volume", "holders"] as const;
export type Sort = (typeof SORTS)[number];
export const isSort = (v: unknown): v is Sort => SORTS.includes(v as Sort);
export const PAGE_SIZE = 24;

export function coinJson(c: CoinRow): Coin {
  return {
    mint: c.mint,
    name: c.name,
    symbol: c.symbol,
    description: c.description,
    image: c.image_url,
    metadataUri: c.metadata_uri,
    twitter: c.twitter,
    telegram: c.telegram,
    creator: c.creator,
    pqAddress: c.pq_address,
    leaf: c.leaf,
    digest: c.digest,
    devTokens: c.dev_tokens == null ? null : Number(c.dev_tokens),
    txSignature: c.tx_signature,
    launchedAt: c.launched_at ?? c.created_at,
    priceUsd: c.price_usd,
    marketCapUsd: c.market_cap_usd,
    volume24hUsd: c.volume_24h_usd,
    holders: c.holders,
    progress: c.curve_progress,
    complete: c.complete,
  };
}

/** One page of the coin grid. Cached 10s per query so a busy front page costs one query. */
export function listCoins(p: { sort: Sort; graduated: boolean; q: string; page: number }): Promise<CoinList> {
  const key = `coins:${p.sort}:${p.graduated ? 1 : 0}:${p.page}:${p.q.toLowerCase()}`;
  return cached(key, 10_000, async () => {
    const rows = await coinPage({ sort: p.sort, graduated: p.graduated, q: p.q, offset: p.page * PAGE_SIZE, limit: PAGE_SIZE + 1 });
    return { coins: rows.slice(0, PAGE_SIZE).map(coinJson), hasMore: rows.length > PAGE_SIZE };
  });
}

export function platformStats(): Promise<PlatformStats> {
  return cached("stats:platform", 30_000, counts);
}

/** A coin page's data: the coin, its attestation and the creator's identity. */
export async function tokenDetail(mint: string): Promise<TokenDetail> {
  const found = await cached<TokenDetail | null>(`token:${mint}`, 10_000, async () => {
    const coin = await coinByMint(mint);
    if (!coin) return null; // not cached: a coin that just went live shows up at once
    const identity = await identityByAddress(coin.pq_address);
    return {
      coin: coinJson(coin),
      attestation: { digest: coin.digest, signature: coin.signature },
      keyUse: { purpose: coin.leaf_purpose, ref: coin.leaf_ref, digest: coin.leaf_digest },
      identity: identity ? identityJson(identity) : null,
    };
  });
  return found ?? { coin: null, attestation: null, keyUse: null, identity: null };
}

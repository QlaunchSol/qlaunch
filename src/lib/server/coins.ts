/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { cached } from "./cache";
import { check, db, identityByAddress, maybe, type CoinRow } from "./db";
import { identityJson } from "./identity";

export const SORTS = { new: "launched_at", mcap: "market_cap_usd", volume: "volume_24h_usd", holders: "holders" } as const;
export type Sort = keyof typeof SORTS;
export const isSort = (v: unknown): v is Sort => typeof v === "string" && v in SORTS;
export const PAGE_SIZE = 24;

export function coinJson(c: CoinRow) {
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
    devBuySol: Number(c.dev_buy_sol),
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
export type Coin = ReturnType<typeof coinJson>;

/** One page of the coin grid. Cached 10s per query so a busy front page costs one query. */
export function listCoins(p: { sort: Sort; graduated: boolean; q: string; page: number }): Promise<{ coins: Coin[]; hasMore: boolean }> {
  const key = `coins:${p.sort}:${p.graduated ? 1 : 0}:${p.page}:${p.q.toLowerCase()}`;
  return cached(key, 10_000, async () => {
    let query = db().from("coins").select("*");
    if (p.graduated) query = query.eq("complete", true);
    if (p.q) {
      const q = p.q.replace(/[%_,()*\\]/g, "");
      query = q.length >= 32 ? query.or(`mint.eq.${q},pq_address.eq.${q},creator.eq.${q}`) : query.or(`name.ilike.%${q}%,symbol.ilike.%${q}%`);
    }
    const rows = check(
      await query
        .order(SORTS[p.sort], { ascending: false, nullsFirst: false })
        .order("launched_at", { ascending: false })
        .range(p.page * PAGE_SIZE, p.page * PAGE_SIZE + PAGE_SIZE),
    ) as CoinRow[];
    return { coins: rows.slice(0, PAGE_SIZE).map(coinJson), hasMore: rows.length > PAGE_SIZE };
  });
}

async function count(table: string, apply?: (q: any) => any): Promise<number> {
  let q = db().from(table).select("*", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count: n, error } = await q;
  if (error) throw new Error(`db: ${error.message}`);
  return n ?? 0;
}

export function platformStats(): Promise<{ identities: number; launches: number; keysSpent: number; anchored: number }> {
  return cached("stats:platform", 30_000, async () => {
    const [identities, launches, keysSpent, anchored] = await Promise.all([
      count("identities"),
      count("launches", (q) => q.eq("status", "live")),
      count("leaf_uses"),
      count("identities", (q) => q.not("anchor_tx", "is", null)),
    ]);
    return { identities, launches, keysSpent, anchored };
  });
}

/** A coin page's data: the coin, its attestation and the creator's identity. */
export async function tokenDetail(mint: string) {
  const found = await cached(`token:${mint}`, 10_000, async () => {
    const coin = maybe(await db().from("coins").select("*").eq("mint", mint).maybeSingle<CoinRow>());
    if (!coin) return null; // not cached: a coin that just went live shows up at once
    const launch = check(await db().from("launches").select("digest, signature").eq("mint", mint).single<{ digest: string; signature: string }>());
    const identity = await identityByAddress(coin.pq_address);
    return {
      coin: coinJson(coin),
      attestation: { digest: launch.digest, signature: launch.signature },
      identity: identity ? identityJson(identity) : null,
    };
  });
  return found ?? { coin: null, attestation: null, identity: null };
}
export type TokenDetail = Awaited<ReturnType<typeof tokenDetail>>;

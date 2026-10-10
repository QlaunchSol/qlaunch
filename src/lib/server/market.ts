import "server-only";
import { bondingCurveMarketCap, bondingCurvePda } from "@pump-fun/pump-sdk";
import { PublicKey } from "@solana/web3.js";
import type { Candle } from "@/lib/types";
import { cached } from "./cache";
import { liveMints, upsertMarket } from "./db";
import { configured, env } from "./env";
import { LAMPORTS_PER_SOL, connection, pumpSdk, pumpState } from "./solana";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_DECIMALS = 6;
const UA = { "User-Agent": "launchpad/1.0", Accept: "application/json" };

async function getJson<T>(url: string, init?: RequestInit, timeoutMs = 8_000): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, headers: { ...UA, ...init?.headers }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const GECKO = { headers: { Accept: "application/json;version=20230302" } };

/** SOL/USD: Jupiter first, GeckoTerminal second (both keyless); a minute of caching. */
export function solUsd(): Promise<number | null> {
  return cached("market:sol-usd", 60_000, async () => {
    const jup = await getJson<Record<string, { usdPrice?: number }>>(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`);
    const fromJup = jup?.[SOL_MINT]?.usdPrice;
    if (fromJup && fromJup > 0) return fromJup;
    const gecko = await getJson<{ data?: { attributes?: { price_usd?: string } } }>(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${SOL_MINT}`, GECKO);
    const fromGecko = Number(gecko?.data?.attributes?.price_usd);
    return fromGecko > 0 ? fromGecko : null;
  });
}

export type CurveState = { priceSol: number; marketCapSol: number; progress: number; complete: boolean };

/** Reads bonding curves straight from chain: exact, and free of any market-data API. */
export async function curveStates(mints: string[]): Promise<Map<string, CurveState>> {
  const out = new Map<string, CurveState>();
  if (!mints.length) return out;
  const { global } = await pumpState();
  const initialReal = Number(global.initialRealTokenReserves.toString());
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const infos = await connection().getMultipleAccountsInfo(chunk.map((m) => bondingCurvePda(new PublicKey(m))));
    infos.forEach((info, j) => {
      if (!info) return;
      const curve = pumpSdk.decodeBondingCurveNullable(info);
      if (!curve || curve.virtualTokenReserves.isZero()) return;
      const vQuote = Number(curve.virtualQuoteReserves.toString()) / LAMPORTS_PER_SOL;
      const vToken = Number(curve.virtualTokenReserves.toString()) / 10 ** TOKEN_DECIMALS;
      const mcapLamports = bondingCurveMarketCap({
        mintSupply: curve.tokenTotalSupply,
        virtualQuoteReserves: curve.virtualQuoteReserves,
        virtualTokenReserves: curve.virtualTokenReserves,
      });
      const realLeft = Number(curve.realTokenReserves.toString());
      out.set(chunk[j], {
        priceSol: vQuote / vToken,
        marketCapSol: Number(mcapLamports.toString()) / LAMPORTS_PER_SOL,
        progress: curve.complete ? 1 : Math.min(1, Math.max(0, 1 - realLeft / initialReal)),
        complete: curve.complete,
      });
    });
  }
  return out;
}

type DexPair = {
  dexId: string;
  pairAddress: string;
  baseToken: { address: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  volume?: { h24?: number };
  liquidity?: { usd?: number };
};

/** DexScreener, 30 tokens per call: 24h volume (summed over pairs) and price after graduation. */
export async function dexStats(mints: string[]): Promise<Map<string, { priceUsd: number | null; marketCap: number | null; volume24h: number }>> {
  const out = new Map<string, { priceUsd: number | null; marketCap: number | null; volume24h: number }>();
  for (let i = 0; i < mints.length; i += 30) {
    const chunk = mints.slice(i, i + 30);
    const pairs = await getJson<DexPair[]>(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`);
    for (const mint of chunk) {
      const mine = (pairs ?? []).filter((p) => p.baseToken?.address === mint);
      if (!mine.length) continue;
      const top = mine.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));
      out.set(mint, {
        priceUsd: top.priceUsd ? Number(top.priceUsd) : null,
        marketCap: top.marketCap ?? top.fdv ?? null,
        volume24h: mine.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0),
      });
    }
  }
  return out;
}

/**
 * Holder count via Helius's token-account API (DAS), when the RPC is Helius:
 * one page, so exact up to 1,000. Other RPCs don't offer it: no count.
 * Each call costs ~10 Helius credits, so it's cached per coin: `ttlMs`.
 */
export function holderCount(mint: string, ttlMs = 10 * 60_000): Promise<number | null> {
  return cached(`market:holders:${mint}`, ttlMs, async () => {
    if (!configured.helius()) return null;
    const das = await getJson<{ result?: { total?: number; token_accounts?: { amount: number; owner: string }[] } }>(env.rpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenAccounts", params: { mint, limit: 1000, page: 1 } }),
    });
    const accounts = das?.result?.token_accounts;
    if (!accounts) return null;
    // The bonding curve itself holds most of the supply; it isn't a holder.
    const curve = bondingCurvePda(new PublicKey(mint)).toBase58();
    return accounts.filter((a) => a.amount > 0 && a.owner !== curve).length;
  });
}

/** Recomputes market rows for these coins and upserts them. */
export async function refreshCoins(mints: string[], { holders = true } = {}) {
  if (!mints.length) return;
  const [sol, curves, dex] = await Promise.all([solUsd(), curveStates(mints), dexStats(mints)]);
  // Holders of coins that traded in the last day every 10 minutes; quiet coins every 2 hours (Helius credits).
  const holderTtl = (m: string) => (dex.get(m)?.volume24h ?? 1) > 0 ? 10 * 60_000 : 2 * 3600_000;
  const holderCounts = holders ? await Promise.all(mints.map((m) => holderCount(m, holderTtl(m)).catch(() => null))) : mints.map(() => null);
  const rows = mints.map((mint, i) => {
    const curve = curves.get(mint);
    const d = dex.get(mint);
    const onCurve = curve && !curve.complete && sol;
    return {
      mint,
      price_usd: onCurve ? curve.priceSol * sol : (d?.priceUsd ?? null),
      market_cap_usd: onCurve ? curve.marketCapSol * sol : (d?.marketCap ?? null),
      volume_24h_usd: d?.volume24h ?? 0,
      ...(holderCounts[i] != null && { holders: holderCounts[i]! }),
      curve_progress: curve?.progress ?? null,
      complete: curve?.complete ?? false,
    };
  });
  await upsertMarket(rows);
}

let running = false;

/** One pass of the background refresher: every live coin, newest first. */
export async function refreshAll() {
  if (running || !configured.db()) return;
  running = true;
  try {
    const mints = await liveMints();
    for (let i = 0; i < mints.length; i += 90) await refreshCoins(mints.slice(i, i + 90));
  } finally {
    running = false;
  }
}

// Candle sizes, each with a few hours to a week of history.
const RANGES = {
  "1m": { gt: "minute", aggregate: 1, limit: 180 },
  "5m": { gt: "minute", aggregate: 5, limit: 144 },
  "15m": { gt: "minute", aggregate: 15, limit: 96 },
  "1h": { gt: "hour", aggregate: 1, limit: 168 },
} as const;
export type ChartRange = keyof typeof RANGES;
export const isChartRange = (v: unknown): v is ChartRange => typeof v === "string" && v in RANGES;

/** USD candles from GeckoTerminal (free, keyless). Cached one minute. */
export function candles(mint: string, range: ChartRange): Promise<Candle[]> {
  return cached(`market:candles:${mint}:${range}`, 60_000, async () => {
    const r = RANGES[range];
    const pools = await getJson<{ data?: { attributes: { address: string } }[] }>(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`, GECKO);
    const pool = pools?.data?.[0]?.attributes.address;
    if (pool) {
      const ohlcv = await getJson<{ data?: { attributes: { ohlcv_list: number[][] } } }>(
        `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/${r.gt}?aggregate=${r.aggregate}&limit=${r.limit}&currency=usd&token=${mint}`,
        GECKO,
      );
      const list = ohlcv?.data?.attributes.ohlcv_list;
      if (list?.length) return list.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume })).sort((a, b) => a.time - b.time);
    }
    return [];
  });
}

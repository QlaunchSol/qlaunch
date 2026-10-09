"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { Coin, CoinList } from "@/lib/types";
import { CoinCard } from "./coin-card";
import { Button, ButtonLink, Tabs, inputClass } from "./ui";

type Sort = "new" | "mcap" | "volume" | "holders";

export function CoinGrid({ initial }: { initial: CoinList | null }) {
  const [sort, setSort] = useState<Sort>("new");
  const [graduated, setGraduated] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [coins, setCoins] = useState<Coin[]>(initial?.coins ?? []);
  const [hasMore, setHasMore] = useState(initial?.hasMore ?? false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const first = useRef(Boolean(initial));

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const url = useCallback((p: number) => `/api/launches?sort=${sort}&graduated=${graduated ? 1 : 0}&page=${p}&q=${encodeURIComponent(debounced)}`, [sort, graduated, debounced]);

  const load = useCallback(
    async (p: number, append: boolean) => {
      setLoading(true);
      try {
        const res = await api<CoinList>(url(p));
        setCoins((prev) => (append ? [...prev, ...res.coins.filter((c) => !prev.some((x) => x.mint === c.mint))] : res.coins));
        setHasMore(res.hasMore);
        setPage(p);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load coins");
      } finally {
        setLoading(false);
      }
    },
    [url],
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    load(0, false);
  }, [load]);

  // Market numbers refresh every 20s.
  useEffect(() => {
    const t = setInterval(() => {
      if (page === 0 && document.visibilityState === "visible") {
        api<CoinList>(url(0))
          .then((res) => setCoins((prev) => [...res.coins, ...prev.slice(res.coins.length)]))
          .catch(() => {});
      }
    }, 20_000);
    return () => clearInterval(t);
  }, [url, page]);

  // New coins appear live at the top of the "new" view, pushed by our own server.
  useEffect(() => {
    if (sort !== "new" || graduated || debounced || typeof EventSource === "undefined") return;
    const source = new EventSource("/api/launches/stream");
    source.addEventListener("launch", async (e) => {
      const mint = (e as MessageEvent<string>).data;
      const res = await api<{ coin: Coin | null }>(`/api/token/${mint}`).catch(() => null);
      if (!res?.coin) return;
      setCoins((prev) => (prev.some((c) => c.mint === mint) ? prev : [res.coin!, ...prev]));
      setFresh((prev) => new Set(prev).add(mint));
    });
    return () => source.close();
  }, [sort, graduated, debounced]);

  const empty = !loading && coins.length === 0;
  const sortOptions = useMemo(
    () => [
      { value: "new" as const, label: "New" },
      { value: "mcap" as const, label: "Market cap" },
      { value: "volume" as const, label: "24h volume" },
      { value: "holders" as const, label: "Holders" },
    ],
    [],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={sort} options={sortOptions} onChange={setSort} />
          <Tabs
            value={graduated ? "grad" : "all"}
            options={[
              { value: "all", label: "All" },
              { value: "grad", label: "Graduated" },
            ]}
            onChange={(v) => setGraduated(v === "grad")}
          />
        </div>
        <label className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input className={`${inputClass} pl-9`} placeholder="Name, ticker, mint or pq1…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search coins" />
        </label>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}

      {empty ? (
        <div className="rounded-xl border border-dashed border-line-2 px-6 py-16 text-center">
          <p className="text-sm text-muted">{debounced || graduated ? "No coins match." : "No coins yet. Be the first to launch one with a post-quantum signature."}</p>
          {!debounced && !graduated && (
            <ButtonLink href="/launch" className="mt-4">
              Launch a coin
            </ButtonLink>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {coins.map((c) => (
            <CoinCard key={c.mint} coin={c} fresh={fresh.has(c.mint)} />
          ))}
          {loading &&
            coins.length === 0 &&
            Array.from({ length: 6 }, (_, i) => <div key={i} className="h-40 animate-pulse rounded-xl border border-line bg-panel" />)}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => load(page + 1, true)} loading={loading}>
            Load more
          </Button>
        </div>
      )}
    </section>
  );
}

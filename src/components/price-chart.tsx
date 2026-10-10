"use client";

import { CandlestickSeries, ColorType, createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { price } from "@/lib/format";
import type { Candle } from "@/lib/types";
import { Tabs } from "./ui";

/** Candle size. New coins trade in minutes, so 1m is the default. */
type Range = "1m" | "5m" | "15m" | "1h";

export function PriceChart({ mint }: { mint: string }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<Range>("1m");
  const [candles, setCandles] = useState<Candle[] | null>(null);

  useEffect(() => {
    let live = true;
    setCandles(null);
    const load = () =>
      api<{ candles: Candle[] }>(`/api/token/${mint}/chart?range=${range}`)
        .then((r) => live && setCandles(r.candles))
        .catch(() => live && setCandles([]));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [mint, range]);

  useEffect(() => {
    if (!box.current || !candles?.length) return;
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#95a2ab", fontFamily: "var(--font-geist-mono)", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: "#161d22" }, horzLines: { color: "#161d22" } },
      rightPriceScale: { borderColor: "#1c242a" },
      // Slim candles even when a new coin has only a few: fitContent would otherwise stretch them across the chart.
      timeScale: { borderColor: "#1c242a", timeVisible: true, secondsVisible: false, maxBarSpacing: 18, rightOffset: 2 },
      crosshair: { vertLine: { color: "#2a353d" }, horzLine: { color: "#2a353d" } },
      localization: { priceFormatter: (p: number) => price(p) },
    });
    const series = c.addSeries(CandlestickSeries, {
      upColor: "#5ef0b6",
      downColor: "#ff7070",
      wickUpColor: "#5ef0b6",
      wickDownColor: "#ff7070",
      borderVisible: false,
      priceFormat: { type: "custom", formatter: (p: number) => price(p), minMove: 1e-12 },
    });
    series.setData(candles.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })));
    c.timeScale().fitContent();
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, [candles]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-faint">Price (USD)</span>
        <Tabs
          value={range}
          onChange={setRange}
          options={(["1m", "5m", "15m", "1h"] as const).map((r) => ({ value: r, label: r }))}
        />
      </div>
      <div className="relative h-72">
        {candles === null && <div className="absolute inset-0 animate-pulse rounded-lg bg-panel-2" />}
        {candles?.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-dashed border-line-2 text-xs text-faint">
            No trades yet. The chart appears a minute or two after the first trade.
          </div>
        )}
        <div ref={box} className="absolute inset-0" />
      </div>
    </div>
  );
}

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { count, short, usd } from "@/lib/format";
import type { Coin } from "@/lib/types";
import { ChainStrip } from "./chain-strip";
import { CoinImage } from "./coin-image";
import { TimeAgo } from "./time-ago";
import { Progress, cx } from "./ui";

export function CoinCard({ coin, fresh }: { coin: Coin; fresh?: boolean }) {
  return (
    <Link
      href={`/coin/${coin.mint}`}
      className={cx(
        "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-panel p-3.5 transition-all duration-300",
        "hover:-translate-y-1 hover:border-mint/35 hover:bg-panel-2 hover:shadow-[0_14px_40px_-18px_rgb(94_240_182/0.45)]",
        fresh ? "animate-rise border-mint/50 animate-pulse-mint" : "border-line",
      )}
    >
      {/* a soft mint glow from the top edge on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(70%_100%_at_50%_0%,rgb(94_240_182/0.10),transparent)] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative flex gap-3">
        <div className="relative shrink-0">
          <CoinImage src={coin.image} alt={coin.name} className="size-16 rounded-xl ring-1 ring-line transition-transform duration-500 group-hover:scale-[1.06] group-hover:ring-mint/40" />
          <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-mint/40 bg-bg text-mint shadow-[0_0_10px_rgb(94_240_182/0.35)]">
            <ShieldCheck className="size-3" aria-label="Post-quantum attested" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-fg transition-colors group-hover:text-mint">{coin.name}</span>
            {coin.official && <span className="shrink-0 rounded-full border border-mint/40 bg-mint/10 px-1.5 py-px text-[10px] font-medium text-mint">Official</span>}
          </div>
          <div className="font-mono text-xs text-muted">${coin.symbol}</div>
          {coin.description && <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted">{coin.description}</p>}
        </div>
      </div>

      <div className="relative rounded-xl border border-line bg-bg/50 px-2.5 pb-2 pt-2.5 transition-colors duration-300 group-hover:border-mint/20">
        <ChainStrip digest={coin.digest} />
        <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[10.5px] text-faint">
          <span className="truncate" title={coin.pqAddress}>
            {short(coin.pqAddress, 8, 4)}
          </span>
          <span className="shrink-0">
            key <span className="text-ice">#{coin.leaf}</span> · 67 chains
          </span>
        </div>
      </div>

      <div className="relative mt-auto space-y-2.5">
        <div className="grid grid-cols-3 gap-2 font-mono text-xs">
          <Stat label="mcap" value={usd(coin.marketCapUsd)} strong />
          <Stat label="vol 24h" value={usd(coin.volume24hUsd)} />
          <Stat label="holders" value={count(coin.holders)} />
        </div>
        {coin.complete ? (
          <div className="flex items-center justify-between text-[11px]">
            <span className="rounded-full border border-mint/30 bg-mint/10 px-2 py-0.5 font-medium text-mint">Graduated</span>
            <span className="text-faint">
              <TimeAgo iso={coin.launchedAt} />
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            <Progress value={coin.progress ?? 0} shimmer />
            <div className="flex justify-between text-[11px] text-faint">
              <span className="tabular">{Math.round((coin.progress ?? 0) * 100)}% bonded</span>
              <span>
                <TimeAgo iso={coin.launchedAt} />
              </span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className={cx("truncate tabular", strong ? "text-fg" : "text-muted")}>{value}</div>
    </div>
  );
}

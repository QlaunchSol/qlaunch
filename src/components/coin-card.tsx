import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ago, count, short, usd } from "@/lib/format";
import type { Coin } from "@/lib/types";
import { CoinImage } from "./coin-image";
import { Progress } from "./ui";

export function CoinCard({ coin, now, fresh }: { coin: Coin; now: number; fresh?: boolean }) {
  return (
    <Link
      href={`/coin/${coin.mint}`}
      className={`group flex flex-col gap-3 rounded-xl border bg-panel p-3 transition-colors hover:border-line-2 hover:bg-panel-2 ${fresh ? "animate-rise border-mint/40" : "border-line"}`}
    >
      <div className="flex gap-3">
        <CoinImage src={coin.image} alt={coin.name} className="size-16 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-fg">{coin.name}</span>
            <ShieldCheck className="size-3.5 shrink-0 text-mint" aria-label="Post-quantum attested" />
          </div>
          <div className="font-mono text-xs text-muted">${coin.symbol}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-faint" title={coin.pqAddress}>
            {short(coin.pqAddress, 8, 4)} · key #{coin.leaf}
          </div>
        </div>
      </div>
      {coin.description && <p className="line-clamp-2 text-xs text-muted">{coin.description}</p>}
      <div className="mt-auto space-y-2">
        <div className="flex items-baseline justify-between gap-2 font-mono text-xs">
          <span className="text-fg tabular">
            <span className="text-faint">mc </span>
            {usd(coin.marketCapUsd)}
          </span>
          <span className="text-muted tabular">
            <span className="text-faint">vol </span>
            {usd(coin.volume24hUsd)}
          </span>
          <span className="text-muted tabular">
            <span className="text-faint">holders </span>
            {count(coin.holders)}
          </span>
        </div>
        {coin.complete ? (
          <div className="flex items-center justify-between text-[11px]">
            <span className="rounded-full border border-mint/30 bg-mint/10 px-2 py-0.5 font-medium text-mint">Graduated</span>
            <span className="text-faint">{ago(coin.launchedAt, now)}</span>
          </div>
        ) : (
          <div className="space-y-1">
            <Progress value={coin.progress ?? 0} />
            <div className="flex justify-between text-[11px] text-faint">
              <span className="tabular">{Math.round((coin.progress ?? 0) * 100)}% bonded</span>
              <span>{ago(coin.launchedAt, now)}</span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

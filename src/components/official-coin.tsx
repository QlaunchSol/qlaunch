import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { pumpUrl } from "@/config/site";
import type { OfficialCoin } from "@/lib/server/official";
import { cx } from "@/lib/cx";
import { CopyButton } from "./ui";

/** The official coin's contract address, copyable, with links to its page here and on pump.fun. */
export function OfficialCoinCA({ coin, className }: { coin: OfficialCoin; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs", className)}>
      <span className="text-faint">{coin.symbol ? `$${coin.symbol}` : "Official coin"} CA</span>
      <Link href={`/coin/${coin.mint}`} className="break-all text-fg transition-colors hover:text-mint" title="Open its page">
        {coin.mint}
      </Link>
      <CopyButton value={coin.mint} />
      <a href={pumpUrl(coin.mint)} target="_blank" rel="noreferrer" className="text-faint transition-colors hover:text-fg">
        pump.fun ↗
      </a>
    </div>
  );
}

/**
 * Site-wide bar above the navigation: the one official contract address, in
 * full (impostors mimic the first and last characters), so nobody mistakes a
 * copycat coin for the project's own.
 */
export function OfficialBanner({ coin, siteName }: { coin: OfficialCoin; siteName: string }) {
  const label = coin.symbol ? `$${coin.symbol}` : `${siteName} coin`;
  return (
    <div className="relative overflow-hidden border-b border-mint/30 bg-mint-dim/60">
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-mint/10 to-transparent" />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 py-2 text-center sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-mint">
          <ShieldCheck className="size-3.5" aria-hidden />
          Official {label} contract
        </span>
        <span className="flex flex-wrap items-center justify-center gap-x-1">
          <Link href={`/coin/${coin.mint}`} className="break-all font-mono text-xs text-fg transition-colors hover:text-mint" title="Open its page">
            {coin.mint}
          </Link>
          <CopyButton value={coin.mint} label="Copy CA" className="text-mint hover:text-fg" />
          <a href={pumpUrl(coin.mint)} target="_blank" rel="noreferrer" className="px-1 text-[11px] text-muted transition-colors hover:text-fg">
            pump.fun ↗
          </a>
        </span>
        <span className="text-[11px] text-muted">Any other coin using our name is not ours.</span>
      </div>
    </div>
  );
}

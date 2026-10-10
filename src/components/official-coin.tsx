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

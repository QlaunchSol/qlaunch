import Link from "next/link";
import { site } from "@/config/site";
import { Wordmark } from "./logo";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1fr_auto]">
        <div className="max-w-md space-y-3">
          <Wordmark name={site.name} />
          <p className="text-xs leading-relaxed text-faint">
            Coins launch on pump.fun&apos;s bonding curve, on Solana. {site.name} is independent and not affiliated with pump.fun. Memecoins are highly speculative: most go to
            zero. A post-quantum attestation proves who launched a coin, not that it is worth anything.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted sm:flex-col">
          <Link href="/docs" className="hover:text-fg">
            How it works
          </Link>
          <Link href="/verify" className="hover:text-fg">
            Verify a coin
          </Link>
          <a href="https://pump.fun" target="_blank" rel="noreferrer" className="hover:text-fg">
            Built on pump.fun
          </a>
          {site.twitter && (
            <a href={site.twitter} target="_blank" rel="noreferrer" className="hover:text-fg">
              X
            </a>
          )}
          {site.github && (
            <a href={site.github} target="_blank" rel="noreferrer" className="hover:text-fg">
              GitHub
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}

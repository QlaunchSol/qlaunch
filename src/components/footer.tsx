import Link from "next/link";
import { site } from "@/config/site";
import { PROTOCOL } from "@/lib/pq/params";
import { officialCoin } from "@/lib/server/official";
import { OfficialCoinCA } from "./official-coin";
import { Wordmark } from "./logo";
import { SocialLinks } from "./social-icons";

function Column({ title, links }: { title: string; links: { href: string; label: string; external?: boolean }[] }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wider text-faint">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            {l.external ? (
              <a href={l.href} target="_blank" rel="noreferrer" className="text-muted transition-colors hover:text-fg">
                {l.label} <span className="text-faint">↗</span>
              </a>
            ) : (
              <Link href={l.href} className="text-muted transition-colors hover:text-fg">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function Footer() {
  const official = await officialCoin();
  return (
    <footer className="mt-24 border-t border-line">
      {official && (
        <div className="border-b border-line bg-panel/60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span className="text-xs font-medium text-mint">Official {site.name} coin</span>
            <OfficialCoinCA coin={official} />
          </div>
        </div>
      )}
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-4 py-12 md:grid-cols-[1.6fr_1fr_1fr]">
        <div className="col-span-2 max-w-md space-y-4 md:col-span-1">
          <Wordmark name={site.name} />
          <p className="text-xs leading-relaxed text-faint">
            Coins launch on pump.fun&apos;s bonding curve, on Solana. {site.name} is independent and not affiliated with pump.fun. Memecoins are highly speculative:
            most go to zero. A post-quantum attestation proves who launched a coin, not that it is worth anything.
          </p>
          <SocialLinks twitter={site.twitter} github={site.github} className="-ml-2" />
        </div>
        <Column
          title="Product"
          links={[
            { href: "/", label: "Coins" },
            { href: "/launch", label: "Launch a coin" },
            { href: "/identity", label: "Your identity" },
            { href: "/verify", label: "Verify a coin" },
          ]}
        />
        <Column
          title="Learn"
          links={[
            { href: "/docs", label: "How it works" },
            { href: "/docs#verify", label: "Verify it yourself" },
            ...(site.github ? [{ href: site.github, label: "Source code", external: true }] : []),
            { href: "https://pump.fun", label: "pump.fun", external: true },
          ]}
        />
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 pt-5 text-[11px] leading-relaxed text-faint">
          <span className="text-muted">Disclaimer.</span> {official?.symbol ? `$${official.symbol}` : `The ${site.name} coin`} is a memecoin. It has no intrinsic
          value, no utility, no roadmap and no team promises of any kind, and you should expect no financial return from it. The same goes for every coin
          launched here: they are created by their launchers, not by {site.name}, and listing one is not an endorsement. Nothing on this site is financial,
          investment or legal advice. Crypto assets are highly volatile and you can lose everything you put in. Only use money you can afford to lose, and
          check that buying memecoins is legal where you live. {site.name} is experimental, open-source software provided as is, without warranty.
        </p>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 font-mono text-[11px] text-faint">
          <span>
            © {new Date().getUTCFullYear()} {site.name} · MIT licensed
          </span>
          <span>
            {PROTOCOL} · WOTS+ · SHA-256 only
          </span>
        </div>
      </div>
    </footer>
  );
}

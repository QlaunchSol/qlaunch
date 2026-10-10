import { ArrowRight } from "lucide-react";
import { CoinGrid } from "@/components/coin-grid";
import { HowItWorks } from "@/components/how-it-works";
import { LiveVerify } from "@/components/live-verify";
import { ButtonLink } from "@/components/ui";
import { site } from "@/config/site";
import { configured } from "@/lib/server/env";
import { listCoins, platformStats } from "@/lib/server/coins";
import { SIGNATURE_BYTES } from "@/lib/pq";
import type { CoinList, PlatformStats } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadInitial(): Promise<{ list: CoinList | null; stats: PlatformStats | null }> {
  if (!configured.db()) return { list: null, stats: null };
  const [list, stats] = await Promise.all([listCoins({ sort: "new", graduated: false, q: "", page: 0 }).catch(() => null), platformStats().catch(() => null)]);
  return { list, stats };
}

export default async function Home() {
  const { list, stats } = await loadInitial();
  return (
    <div>
      <section className="relative overflow-hidden border-b border-line">
        <div className="lattice absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div className="animate-rise">
            <a href="/docs#threat" className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-panel/70 px-3 py-1 text-xs text-muted transition-colors hover:text-fg">
              <span className="size-1.5 rounded-full bg-mint" />
              Why hash-based keys, and why now
              <ArrowRight className="size-3" />
            </a>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-fg sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
              {site.tagline.split(" ").slice(0, 3).join(" ")}
              <br />
              <span className="text-mint">{site.tagline.split(" ").slice(3).join(" ")}</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
              Every coin here is signed by a one-time, hash-based key derived from your wallet. It trades on pump.fun like any other, and its proof of
              origin rests on SHA-256 alone, so it still holds after quantum computers break the elliptic curves Solana runs on.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/launch" size="lg">
                Launch a coin
              </ButtonLink>
              <ButtonLink href="/docs" size="lg" variant="secondary">
                How it works
              </ButtonLink>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-faint">Signature</dt>
                <dd className="mt-1 font-mono text-lg tabular text-fg">{SIGNATURE_BYTES.toLocaleString("en-US")} B</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-faint">Keys / identity</dt>
                <dd className="mt-1 font-mono text-lg tabular text-fg">256</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-faint">Assumption</dt>
                <dd className="mt-1 font-mono text-lg text-fg">SHA-256</dd>
              </div>
            </dl>
          </div>
          <div className="animate-rise [animation-delay:120ms]">
            <LiveVerify coins={list?.coins ?? []} />
          </div>
        </div>
      </section>

      <HowItWorks />

      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-fg">Every attested launch</h2>
            <p className="mt-1 text-sm text-muted">Each one verifiable in your browser, down to the last hash.</p>
          </div>
          {stats && (
            <dl className="flex gap-6 font-mono text-xs text-muted">
              <div>
                <dt className="inline text-faint">coins </dt>
                <dd className="inline tabular text-fg">{stats.launches}</dd>
              </div>
              <div>
                <dt className="inline text-faint">identities </dt>
                <dd className="inline tabular text-fg">{stats.identities}</dd>
              </div>
              <div>
                <dt className="inline text-faint">keys spent </dt>
                <dd className="inline tabular text-fg">{stats.keysSpent}</dd>
              </div>
            </dl>
          )}
        </div>
        <CoinGrid initial={list} />
      </section>
    </div>
  );
}

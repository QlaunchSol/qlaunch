"use client";

import { ExternalLink, PartyPopper, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { coinUrl, explorerAccount, explorerTx, pumpUrl, site } from "@/config/site";
import { api } from "@/lib/client/api";
import type { Verdict } from "@/lib/client/verify-coin";
import { count, price, usd } from "@/lib/format";
import type { TokenDetail } from "@/lib/types";
import { CoinImage } from "./coin-image";
import { PriceChart } from "./price-chart";
import { ReportButton } from "./report-dialog";
import { TimeAgo } from "./time-ago";
import { VerifyPanel } from "./verify-panel";
import { Badge, ButtonLink, CopyButton, Hash, Notice, Panel, PanelHeader, Progress, Stat } from "./ui";

export function CoinView({ initial }: { initial: TokenDetail }) {
  const [detail, setDetail] = useState(initial);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const launched = useSearchParams().get("launched") === "1";
  const coin = detail.coin!;
  const identity = detail.identity;

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      api<TokenDetail>(`/api/token/${coin.mint}`)
        .then((d) => d.coin && setDetail(d))
        .catch(() => {});
    }, 20_000);
    return () => clearInterval(t);
  }, [coin.mint]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {launched && (
        <Notice tone="ok" title={<span className="flex items-center gap-2"><PartyPopper className="size-4" /> Your coin is live</span>}>
          Share it: <span className="font-mono text-fg">{coinUrl(coin.mint)}</span> <CopyButton value={coinUrl(coin.mint)} />
        </Notice>
      )}

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <CoinImage src={coin.image} alt={coin.name} className="size-24 shrink-0 rounded-2xl border border-line sm:size-28" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{coin.name}</h1>
            <span className="font-mono text-lg text-muted">${coin.symbol}</span>
            {verdict === "valid" ? (
              <Badge tone="mint">
                <ShieldCheck className="size-3" /> PQ-attested
              </Badge>
            ) : verdict === "invalid" ? (
              <Badge tone="bad">attestation invalid</Badge>
            ) : (
              <Badge>{verdict === "unknown" ? "attestation unchecked" : "verifying…"}</Badge>
            )}
            {coin.complete && <Badge tone="ice">Graduated</Badge>}
          </div>
          {coin.description && <p className="max-w-2xl whitespace-pre-line break-words text-sm text-muted">{coin.description}</p>}
          <p className="text-[11px] text-faint">
            Attested means the launcher is identified, not that {site.name} vouches for the coin. Do your own research.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
            <span className="flex items-center gap-1">
              mint <Hash value={coin.mint} href={explorerAccount(coin.mint)} />
            </span>
            <TimeAgo iso={coin.launchedAt} prefix="launched " />
            <ReportButton mint={coin.mint} />
            {coin.twitter && (
              <a href={coin.twitter} target="_blank" rel="noreferrer" className="hover:text-fg">
                X ↗
              </a>
            )}
            {coin.telegram && (
              <a href={coin.telegram} target="_blank" rel="noreferrer" className="hover:text-fg">
                Telegram ↗
              </a>
            )}
          </div>
        </div>
        <ButtonLink href={pumpUrl(coin.mint)} size="lg" className="shrink-0">
          Trade on pump.fun <ExternalLink className="size-4" />
        </ButtonLink>
      </div>

      <Panel className="grid grid-cols-2 gap-6 p-5 sm:grid-cols-5">
        <Stat label="Price" value={price(coin.priceUsd)} />
        <Stat label="Market cap" value={usd(coin.marketCapUsd)} />
        <Stat label="24h volume" value={usd(coin.volume24hUsd)} />
        <Stat label="Holders" value={count(coin.holders)} />
        <div className="col-span-2 sm:col-span-1">
          <div className="text-[11px] uppercase tracking-wider text-faint">Bonding curve</div>
          {coin.complete ? (
            <div className="mt-1 text-sm text-ice">Graduated to PumpSwap</div>
          ) : (
            <div className="mt-2.5 space-y-1">
              <Progress value={coin.progress ?? 0} />
              <div className="font-mono text-xs text-muted">{Math.round((coin.progress ?? 0) * 100)}%</div>
            </div>
          )}
        </div>
      </Panel>

      <Panel className="p-5">
        <PriceChart mint={coin.mint} />
      </Panel>

      <VerifyPanel detail={detail} onVerdict={setVerdict} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Launched by" />
          <dl className="divide-y divide-line text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-faint">Post-quantum identity</dt>
              <dd>
                <Hash value={coin.pqAddress} head={12} tail={6} />
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-faint">Wallet</dt>
              <dd>
                <Hash value={coin.creator} href={explorerAccount(coin.creator)} />
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-faint">One-time key</dt>
              <dd className="font-mono text-fg">#{coin.leaf} of 256</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-faint">Root anchored</dt>
              <dd className="text-fg">
                {identity?.anchor ? (
                  <a href={explorerTx(identity.anchor.tx)} target="_blank" rel="noreferrer" className="text-mint hover:underline">
                    slot {identity.anchor.slot?.toLocaleString("en-US")} ↗
                  </a>
                ) : (
                  <span className="text-faint">no</span>
                )}
              </dd>
            </div>
            {coin.devTokens != null && coin.devTokens > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <dt className="text-faint">Dev buy (on chain)</dt>
                <dd className="font-mono text-fg">{((coin.devTokens / 1e9) * 100).toFixed(2)}% of supply</dd>
              </div>
            )}
          </dl>
        </Panel>
        <Panel>
          <PanelHeader title="Attestation" sub="Pinned to IPFS inside the coin's own metadata." />
          <dl className="divide-y divide-line text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-faint">Signed digest</dt>
              <dd>{detail.attestation && <Hash value={detail.attestation.digest} head={10} tail={8} />}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-faint">Signature</dt>
              <dd className="flex items-center gap-1 font-mono text-fg">
                2,404 bytes {detail.attestation && <CopyButton value={detail.attestation.signature} label="Copy base64" />}
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-faint">Metadata</dt>
              <dd>
                <a href={coin.metadataUri} target="_blank" rel="noreferrer" className="font-mono text-fg hover:text-mint">
                  IPFS ↗
                </a>
              </dd>
            </div>
            {coin.txSignature && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <dt className="text-faint">Launch transaction</dt>
                <dd>
                  <Hash value={coin.txSignature} href={explorerTx(coin.txSignature)} />
                </dd>
              </div>
            )}
            <div className="px-5 py-3">
              <dt className="text-faint">Verify it yourself, with nothing but Python&apos;s standard library</dt>
              <dd className="mt-2 flex items-center gap-2 rounded-md bg-panel-2 px-3 py-2 font-mono text-[11px] text-muted">
                <span className="truncate">python3 verify.py {coinUrl(coin.mint)}</span>
                <CopyButton value={`python3 verify.py ${coinUrl(coin.mint)}`} />
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}

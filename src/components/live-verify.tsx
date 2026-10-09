"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { identityFromHex, launchDigest, signatureFromBase64, verify, type VerifyTrace } from "@/lib/pq";
import demo from "@/lib/demo-vector.json";
import { verifyCoin } from "@/lib/client/verify-coin";
import { short } from "@/lib/format";
import type { Coin, TokenDetail } from "@/lib/types";
import { VerifyAnimation } from "./verify-visual";

type Subject = { label: string; sub: string; href: string | null; trace: VerifyTrace };

function demoSubject(): Subject {
  const id = identityFromHex(demo.identity)!;
  const trace = verify(launchDigest(demo.fields), signatureFromBase64(demo.signature)!, id);
  return { label: `${demo.fields.name} (test vector)`, sub: `key #${demo.fields.leaf} of ${short(demo.identity.address, 8, 4)}`, href: "/docs#verify", trace };
}

/**
 * Re-verifies the newest launches in the visitor's own browser, one after
 * another. With no launches yet, it verifies the published test vector.
 */
export function LiveVerify({ coins }: { coins: Coin[] }) {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const candidates = coins.slice(0, 5);
    (async () => {
      if (!candidates.length) {
        setSubject(demoSubject());
        return;
      }
      const coin = candidates[round % candidates.length];
      try {
        const detail = await fetch(`/api/token/${coin.mint}`).then((r) => r.json() as Promise<TokenDetail>);
        const result = await verifyCoin(coin.mint, detail.identity);
        if (cancelled) return;
        if (result.trace) {
          setSubject({ label: `${coin.name} ($${coin.symbol})`, sub: `key #${coin.leaf} of ${short(coin.pqAddress, 8, 4)}`, href: `/coin/${coin.mint}`, trace: result.trace });
          return;
        }
      } catch {}
      if (!cancelled) setSubject(demoSubject());
    })();
    return () => {
      cancelled = true;
    };
  }, [coins, round]);

  useEffect(() => {
    if (coins.length < 2) return;
    const t = setInterval(() => setRound((r) => r + 1), 9_000);
    return () => clearInterval(t);
  }, [coins.length]);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel/90 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-line-2" />
        <span className="size-2.5 rounded-full bg-line-2" />
        <span className="size-2.5 rounded-full bg-line-2" />
        <span className="ml-2 font-mono text-xs text-faint">wots verify --live</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-mint">
          <span className="size-1.5 animate-pulse rounded-full bg-mint" />
          in your browser
        </span>
      </div>
      <div className="space-y-4 p-4">
        {subject ? (
          <>
            <div className="flex items-baseline justify-between gap-3 font-mono text-xs">
              {subject.href ? (
                <Link href={subject.href} className="truncate text-fg hover:text-mint">
                  {subject.label}
                </Link>
              ) : (
                <span className="truncate text-fg">{subject.label}</span>
              )}
              <span className="shrink-0 text-faint">{subject.sub}</span>
            </div>
            <div className="font-mono text-[11px] text-faint">
              <span className="text-muted">digest</span> {short(subject.trace.digest, 16, 8)}
            </div>
            <VerifyAnimation trace={subject.trace} playKey={`${round}:${subject.trace.digest}`} />
          </>
        ) : (
          <div className="h-80 animate-pulse rounded-md bg-panel-2" />
        )}
      </div>
    </div>
  );
}

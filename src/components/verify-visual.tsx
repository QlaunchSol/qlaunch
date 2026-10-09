"use client";

import { useEffect, useRef, useState } from "react";
import type { VerifyTrace } from "@/lib/pq";
import { cx } from "./ui";

const CHAINS = 67;
const POSITIONS = 16; // chain positions 0..15; 15 is the public end

/**
 * The 67 WOTS chains as columns, position 0 at the bottom. The signer revealed
 * position d of each chain (ice); the verifier hashes upward from there to the
 * public end (mint). Nothing below d is ever revealed.
 */
export function ChainGrid({ digits, progress, className }: { digits: number[]; progress: number; className?: string }) {
  const cell = 7;
  const gap = 2;
  const w = CHAINS * (cell + gap) - gap;
  const h = POSITIONS * (cell + gap) - gap;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cx("w-full", className)} role="img" aria-label="WOTS hash chains being verified">
      {digits.map((d, i) => {
        const walked = d + Math.floor(progress * (15 - d) + 1e-9);
        const x = i * (cell + gap);
        const checksum = i >= 64;
        return (
          <g key={i}>
            {Array.from({ length: POSITIONS }, (_, p) => {
              const y = h - (p + 1) * (cell + gap) + gap;
              let cls = "fill-panel-3";
              if (p === d) cls = checksum ? "fill-warn" : "fill-ice";
              else if (p > d && p <= walked) cls = p === 15 ? "fill-mint" : "fill-mint/45";
              else if (p === 15) cls = "fill-line-2";
              return <rect key={p} x={x} y={y} width={cell} height={cell} rx={1.5} className={cls} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

export function useProgress(durationMs: number, run: boolean, key: unknown): number {
  const [p, setP] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    if (!run) return;
    setP(0);
    start.current = null;
    let frame = 0;
    const tick = (t: number) => {
      start.current ??= t;
      const next = Math.min(1, (t - start.current) / durationMs);
      setP(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, run, key]);
  return p;
}

const short = (h: string, n = 10) => `${h.slice(0, n)}…`;

/** Leaf → root, one row per tree level, revealed as `progress` advances. */
export function MerklePath({ trace, progress }: { trace: VerifyTrace; progress: number }) {
  const shown = Math.floor(progress * (trace.path.length + 1));
  return (
    <ol className="space-y-1 font-mono text-[11px]">
      <li className={cx("flex items-center justify-between gap-3 transition-opacity", shown >= 0 ? "opacity-100" : "opacity-0")}>
        <span className="text-faint">leaf {trace.leaf}</span>
        <span className="text-ice">{short(trace.leafHash, 16)}</span>
      </li>
      {trace.path.map((level, i) => (
        <li key={level.height} className={cx("flex items-center justify-between gap-3 transition-opacity duration-300", i < shown ? "opacity-100" : "opacity-15")}>
          <span className="text-faint">
            h{level.height} · node {level.index}
          </span>
          <span className={level.height === 8 ? (trace.valid ? "text-mint" : "text-bad") : "text-muted"}>{short(level.node, 16)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Chains then tree, as one sequence; reports when finished. */
export function VerifyAnimation({ trace, playKey, chainsMs = 1800, treeMs = 900 }: { trace: VerifyTrace; playKey?: unknown; chainsMs?: number; treeMs?: number }) {
  const total = chainsMs + treeMs;
  const p = useProgress(total, true, playKey ?? trace.digest + trace.leaf);
  const chains = Math.min(1, (p * total) / chainsMs);
  const tree = Math.max(0, (p * total - chainsMs) / treeMs);
  const done = p >= 1;
  return (
    <div className="space-y-4">
      <ChainGrid digits={trace.digits} progress={chains} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
        <Legend className="bg-ice" label="revealed by signature" />
        <Legend className="bg-warn" label="checksum chains" />
        <Legend className="bg-mint/45" label="hashed by you" />
        <Legend className="bg-mint" label="public key" />
        <span className="ml-auto font-mono tabular">{Math.round(chains * trace.steps)} / {trace.steps} SHA-256</span>
      </div>
      <MerklePath trace={trace} progress={tree} />
      <div className={cx("flex items-center justify-between rounded-md border px-3 py-2 font-mono text-xs transition-colors", !done ? "border-line text-faint" : trace.valid ? "border-mint/40 bg-mint/5 text-mint" : "border-bad/40 bg-bad/5 text-bad")}>
        <span>{!done ? "verifying…" : trace.valid ? "root matches: signature valid" : "root mismatch: INVALID"}</span>
        <span>{short(trace.expectedRoot, 12)}</span>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx("inline-block size-2 rounded-[2px]", className)} />
      {label}
    </span>
  );
}

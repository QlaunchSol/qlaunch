"use client";

import { useId, useMemo } from "react";
import { hexToBytes } from "@/lib/pq";
import { encodeDigest } from "@/lib/pq/wots";
import { cx } from "./ui";

const CHAINS = 67;
const STEP = 9; // cell 7 + gap 2, as in ChainGrid
const W = CHAINS * STEP - 2;
const H = 16 * STEP - 2;
const top = (p: number) => H - (p + 1) * STEP + 2; // y of chain position p (0 at the bottom)

/**
 * A coin's one-time signature at a glance: its 67 WOTS chains, with the
 * position the signature revealed (ice; checksum chains amber) and the span a
 * verifier hashes up to the public key (mint). The digits come from the signed
 * digest alone. A cell mask gives the grid look with ~3 shapes per chain
 * instead of 16; the hashing "walks" up on load and again on hover.
 */
export function ChainStrip({ digest, className }: { digest: string; className?: string }) {
  const mask = `cells-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const digits = useMemo(() => {
    try {
      return encodeDigest(hexToBytes(digest));
    } catch {
      return null;
    }
  }, [digest]);
  if (!digits) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cx("block w-full", className)} role="img" aria-label="This coin's one-time signature: 67 hash chains">
      <defs>
        <pattern id={`${mask}-p`} width={STEP} height={STEP} patternUnits="userSpaceOnUse">
          <rect width={7} height={7} rx={1.5} fill="white" />
        </pattern>
        <mask id={mask}>
          <rect width={W} height={H} fill={`url(#${mask}-p)`} />
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        <rect width={W} height={H} className="fill-panel-3" />
        {digits.map((d, i) => {
          const x = i * STEP;
          const delay = { animationDelay: `${i * 6}ms` };
          return (
            <g key={i}>
              <rect x={x} y={top(d)} width={7} height={7} className={i >= 64 ? "fill-warn" : "fill-ice"} />
              {d < 14 && <rect x={x} y={top(14)} width={7} height={top(d + 1) + 7 - top(14)} className="chain-walk fill-mint/40" style={delay} />}
              {d < 15 && <rect x={x} y={top(15)} width={7} height={7} className="chain-key fill-mint" style={{ animationDelay: `${i * 6 + 450}ms` }} />}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

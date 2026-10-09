"use client";

import { useState } from "react";
import { LEAVES } from "@/lib/pq";
import type { UsedLeaf } from "@/lib/types";
import { cx } from "./ui";

const TONES: Record<string, string> = {
  register: "bg-ice",
  launch: "bg-mint",
  prove: "bg-warn",
};

/** All 256 one-time keys of an identity: spent ones colored by what they signed. */
export function KeyGrid({ used }: { used: UsedLeaf[] }) {
  const byLeaf = new Map(used.map((u) => [u.leaf, u]));
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? byLeaf.get(hover) : null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-16 gap-[3px]" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: LEAVES }, (_, i) => {
          const u = byLeaf.get(i);
          return (
            <div
              key={i}
              onMouseEnter={() => setHover(i)}
              className={cx("aspect-square rounded-[3px] transition-transform hover:scale-125", u ? TONES[u.purpose] ?? "bg-muted" : "bg-panel-3")}
              title={u ? `#${i}: ${u.purpose}` : `#${i}: unused`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-faint">
        <div className="flex gap-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-ice" /> registration
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-mint" /> launch
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-warn" /> proof
          </span>
        </div>
        <span className="font-mono">{hover !== null ? (h ? `#${hover} · ${h.purpose}${h.ref ? ` · ${h.ref.slice(0, 8)}…` : ""}` : `#${hover} · unused`) : `${LEAVES - used.length} of ${LEAVES} unused`}</span>
      </div>
    </div>
  );
}

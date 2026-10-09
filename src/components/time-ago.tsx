"use client";

import { useEffect, useState } from "react";
import { ago } from "@/lib/format";

/**
 * "12s ago" that hydrates cleanly: the server and the first browser render
 * show the UTC date (identical on both), then it switches to relative time and
 * keeps ticking. Relative time computed on the server would always differ
 * from the browser's a moment later.
 */
export function TimeAgo({ iso, prefix = "" }: { iso: string; prefix?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  const label = now === null ? new Date(iso).toISOString().slice(0, 10) : ago(iso, now);
  return (
    <time dateTime={iso} title={new Date(iso).toUTCString()}>
      {prefix}
      {label}
    </time>
  );
}

import { cx } from "@/lib/cx";

/**
 * The mark: a Merkle tree read from the bottom, two leaves hashing into one
 * root, drawn as a single stroke. Placeholder brand; swap freely.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx("size-7", className)} aria-hidden>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8" className="fill-mint-dim stroke-mint/40" />
      <path d="M9 22 L16 14 L23 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-mint" />
      <path d="M16 14 V8.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-mint" />
      <circle cx="9" cy="22.5" r="2.4" className="fill-mint" />
      <circle cx="23" cy="22.5" r="2.4" className="fill-mint" />
      <circle cx="16" cy="8" r="2.4" className="fill-bg stroke-mint" strokeWidth="1.8" />
    </svg>
  );
}

export function Wordmark({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cx("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-fg">{name}</span>
    </span>
  );
}

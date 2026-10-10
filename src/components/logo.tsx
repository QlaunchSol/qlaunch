import { cx } from "@/lib/cx";

/**
 * The mark: a Q whose ring is the Merkle root and whose tail is a hash chain,
 * the same cells the site's verification grid draws, brightening toward the
 * public end. Same geometry as src/app/icon.svg and public/brand/.
 */
export function LogoMark({ className, tile = true }: { className?: string; tile?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cx("size-7", className)} aria-hidden>
      {tile && <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#0e2a20" stroke="#5ef0b6" strokeOpacity="0.35" />}
      <circle cx="14" cy="14" r="7.4" fill="none" stroke="#5ef0b6" strokeWidth="3.4" />
      <rect x="18.6" y="18.6" width="5" height="5" rx="1.1" fill="#5ef0b6" fillOpacity="0.55" />
      <rect x="22.8" y="22.8" width="5" height="5" rx="1.1" fill="#5ef0b6" />
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

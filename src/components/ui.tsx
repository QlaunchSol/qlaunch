"use client";

import Link from "next/link";
import { useState, type ComponentProps, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export { cx };

type ButtonProps = ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; loading?: boolean };

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";
const buttonVariants = {
  primary: "bg-mint text-bg hover:bg-mint-2",
  secondary: "border border-line-2 bg-panel-2 text-fg hover:border-faint hover:bg-panel-3",
  ghost: "text-muted hover:text-fg hover:bg-panel-2",
  danger: "border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20",
};
const buttonSizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={cx(buttonBase, buttonVariants[variant], buttonSizes[size], className)} disabled={disabled || loading} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "primary", size = "md", className, children }: { href: string; variant?: keyof typeof buttonVariants; size?: keyof typeof buttonSizes; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx(buttonBase, buttonVariants[variant], buttonSizes[size], className)}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}

export function Panel({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-xl border border-line bg-panel", className)} {...rest}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "mint" | "warn" | "bad" | "ice"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "border-line-2 text-muted",
    mint: "border-mint/30 bg-mint/10 text-mint",
    warn: "border-warn/30 bg-warn/10 text-warn",
    bad: "border-bad/30 bg-bad/10 text-bad",
    ice: "border-ice/30 bg-ice/10 text-ice",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>{children}</span>;
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "bad" | "ok"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const tones = { info: "border-ice/25 bg-ice/5", warn: "border-warn/30 bg-warn/5", bad: "border-bad/30 bg-bad/5", ok: "border-mint/30 bg-mint/5" };
  const titleTones = { info: "text-ice", warn: "text-warn", bad: "text-bad", ok: "text-mint" };
  return (
    <div className={cx("rounded-lg border px-4 py-3 text-sm", tones[tone], className)} role={tone === "bad" ? "alert" : undefined}>
      {title && <div className={cx("font-medium", titleTones[tone])}>{title}</div>}
      {children && <div className={cx("text-muted", title ? "mt-1" : null)}>{children}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-bad">{error}</p> : hint ? <p className="text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-line-2 bg-panel-2 px-3 py-2 text-sm text-fg placeholder:text-faint outline-none transition-colors focus:border-mint/60 focus:bg-panel-3 disabled:opacity-60";

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cx("rounded px-1.5 py-0.5 text-[11px] text-faint transition-colors hover:bg-panel-3 hover:text-fg", className)}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/** A long value (hash, address) shown truncated with a copy button. */
export function Hash({ value, head = 6, tail = 6, href, className }: { value: string; head?: number; tail?: number; href?: string; className?: string }) {
  const short = value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
  const body = (
    <span className="font-mono" title={value}>
      {short}
    </span>
  );
  return (
    <span className={cx("inline-flex items-center gap-1 text-fg", className)}>
      {href ? (
        <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="hover:text-mint">
          {body}
        </a>
      ) : (
        body
      )}
      <CopyButton value={value} />
    </span>
  );
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-faint">{label}</div>
      <div className="tabular mt-1 font-mono text-lg text-fg">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Progress({ value, className, shimmer }: { value: number; className?: string; shimmer?: boolean }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-panel-3", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-ice/80 via-mint-2 to-mint transition-[width] duration-500" style={{ width: `${pct}%`, minWidth: pct > 0 ? 6 : 0 }}>
        {shimmer && <span aria-hidden className="absolute inset-y-0 left-0 w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-white/45 to-transparent" />}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("inline-flex rounded-lg border border-line bg-panel p-0.5", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            o.value === value ? "bg-panel-3 text-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, sub }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      {eyebrow && <div className="font-mono text-xs text-mint">{eyebrow}</div>}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h1>
      {sub && <p className="mt-2 max-w-2xl text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function usd(n: number | null | undefined, { compact = true } = {}): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (compact && Math.abs(n) >= 1000) {
    return "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: n >= 1e6 ? 2 : 1 }).format(n);
  }
  return "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: n >= 1 ? 2 : 0 }).format(n);
}

/** Token prices are tiny: show significant digits, with a subscript-zero style for runs of zeros. */
export function price(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const exp = Math.floor(Math.log10(n));
  const zeros = -exp - 1;
  const digits = Math.round(n * 10 ** (-exp + 3)).toString().replace(/0+$/, "") || "0";
  if (zeros >= 4) return `$0.0${toSubscript(zeros)}${digits}`;
  return "$" + n.toFixed(Math.min(10, zeros + 4)).replace(/0+$/, "");
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const toSubscript = (n: number) => String(n).replace(/\d/g, (d) => SUB[Number(d)]);

export function count(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function short(value: string, head = 4, tail = 4): string {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

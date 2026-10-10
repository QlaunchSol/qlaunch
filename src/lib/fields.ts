import { LIMITS } from "@/lib/pq";

/**
 * Launch-field normalization shared by browser and server. The browser signs
 * the normalized values and the server re-normalizes and re-hashes them, so
 * both must agree byte for byte. Each function returns the value or throws a
 * FieldError with a message fit for the form.
 */
export class FieldError extends Error {}

const fail = (message: string): never => {
  throw new FieldError(message);
};

// Invisible and direction-changing characters: they let a name look like another
// coin's (e.g. right-to-left overrides reordering a ticker). Zero-width joiners
// stay out too; emoji sequences render fine without them in names.
const INVISIBLE = /[\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff\ufff9-\ufffb]/g;

export function cleanText(value: unknown, max: number, what: string, { required = false, multiline = false } = {}): string {
  if (value == null || value === "") return required ? fail(`${what} is required`) : "";
  if (typeof value !== "string") return fail(`Invalid ${what}`);
  // Lone surrogates would encode to U+FFFD: two different strings, one digest.
  if (!(value as string & { isWellFormed(): boolean }).isWellFormed()) fail(`${what} contains invalid characters`);
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, "")
    .replace(INVISIBLE, "")
    .trim()
    .normalize("NFC");
  if (required && !cleaned) fail(`${what} is required`);
  if ([...cleaned].length > max) fail(`${what} must be at most ${max} characters`);
  return cleaned;
}

export function cleanHttpsUrl(value: unknown, what: string, hosts?: string[]): string {
  const s = cleanText(value, LIMITS.url, what);
  if (!s) return "";
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return fail(`${what} must be a full https:// link`);
  }
  if (u.protocol !== "https:") fail(`${what} must be an https:// link`);
  if (hosts && !hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) fail(`${what} must be a link on ${hosts.join(" or ")}`);
  return u.toString();
}

/** "@handle", "handle" or an x.com / twitter.com link → https://x.com/… */
export function cleanTwitter(value: unknown): string {
  const s = cleanText(value, LIMITS.url, "X link");
  if (!s) return "";
  const handle = s.match(/^@?([A-Za-z0-9_]{1,15})$/)?.[1];
  if (handle) return `https://x.com/${handle}`;
  return cleanHttpsUrl(s, "X link", ["x.com", "twitter.com"]);
}

/** "@group", "group" or a t.me link → https://t.me/… */
export function cleanTelegram(value: unknown): string {
  const s = cleanText(value, LIMITS.url, "Telegram link");
  if (!s) return "";
  const handle = s.match(/^@?([A-Za-z0-9_]{5,32})$/)?.[1];
  if (handle) return `https://t.me/${handle}`;
  return cleanHttpsUrl(s, "Telegram link", ["t.me", "telegram.me"]);
}

export function cleanSymbol(value: unknown): string {
  const s = cleanText(value, LIMITS.symbol, "Ticker", { required: true });
  if (!/^[A-Za-z0-9]+$/.test(s)) fail("Ticker can only use letters and digits");
  return s;
}

export type LaunchForm = { name: string; symbol: string; description: string; image: string; twitter: string; telegram: string };

/** Names nobody may launch under: no "official Qlaunch token" impersonations. */
const RESERVED = /q\W*l\W*a\W*u\W*n\W*c\W*h/i;

/** `allowReserved`: only for the project's own wallet (site.officialWallet), launching the official coin. */
export function cleanLaunchForm(raw: Partial<Record<keyof LaunchForm, unknown>>, { allowReserved = false } = {}): LaunchForm {
  const name = cleanText(raw.name, LIMITS.name, "Name", { required: true });
  const symbol = cleanSymbol(raw.symbol);
  if (!allowReserved && (RESERVED.test(name) || RESERVED.test(symbol))) fail("Names and tickers containing “Qlaunch” are reserved");
  return {
    name,
    symbol,
    description: cleanText(raw.description, LIMITS.description, "Description", { multiline: true }),
    image: cleanText(raw.image, LIMITS.url, "Image", { required: true }),
    twitter: cleanTwitter(raw.twitter),
    telegram: cleanTelegram(raw.telegram),
  };
}

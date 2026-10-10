import "server-only";
import { createHash } from "node:crypto";
import { ConfigError } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Throws an HTTP error; `code` is a machine-readable reason clients can act on. */
export function bad(message: string, status = 400, code?: string): never {
  throw new HttpError(status, message, code);
}

/**
 * Wraps a route handler: HttpErrors become JSON errors with their status,
 * missing configuration becomes a 503, anything else a logged 500.
 */
export function route<A extends unknown[]>(handler: (request: Request, ...rest: A) => Promise<Response>) {
  return async (request: Request, ...rest: A): Promise<Response> => {
    try {
      return await handler(request, ...rest);
    } catch (err) {
      if (err instanceof HttpError) return Response.json({ error: err.message, ...(err.code && { code: err.code }) }, { status: err.status });
      if (err instanceof ConfigError) {
        console.error("config:", err.message);
        return Response.json({ error: "This feature isn't configured on the server yet." }, { status: 503 });
      }
      console.error(err);
      return Response.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
    }
  };
}

/**
 * Reads at most `maxBytes` of the body, refusing as soon as it is exceeded:
 * the whole body is never buffered first (chunked requests have no length).
 * Caddy enforces the same ceilings in front.
 */
export async function readBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (declared > maxBytes) bad("Request too large", 413);
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      bad("Request too large", 413);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export async function readJson(request: Request, maxBytes = 64_000): Promise<Record<string, unknown>> {
  const bytes = await readBody(request, maxBytes);
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {}
  return bad("Invalid JSON body");
}

/** First 64 bits of an IPv6 address, the unit one subscriber controls. */
function ipv6Prefix64(ip: string): string {
  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  return full.slice(0, 4).map((h) => (h || "0").toLowerCase().replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/**
 * Client address as Caddy reports it (it overwrites X-Forwarded-For with the
 * real peer; Next listens on localhost only). IPv6 clients are grouped by /64,
 * so rotating through one's own addresses doesn't escape rate limits.
 */
export function clientIp(request: Request): string {
  const raw = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (raw.includes(":") && !raw.startsWith("::ffff:")) return ipv6Prefix64(raw);
  return raw.replace(/^::ffff:/, "");
}

/** Salted hash of a client address, for records that must not hold the address itself. */
export function ipHash(ip: string): string {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) throw new ConfigError("IP_HASH_SALT is not set");
  return createHash("sha256").update(salt).update("\0").update(ip).digest("hex").slice(0, 32);
}

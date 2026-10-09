import "server-only";
import { ConfigError } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function bad(message: string, status = 400): never {
  throw new HttpError(status, message);
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
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      if (err instanceof ConfigError) {
        console.error("config:", err.message);
        return Response.json({ error: "This feature isn't configured on the server yet." }, { status: 503 });
      }
      console.error(err);
      return Response.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
    }
  };
}

export async function readJson(request: Request, maxBytes = 64_000): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > maxBytes) bad("Request too large", 413);
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {}
  return bad("Invalid JSON body");
}

/** Client address as Caddy reports it. Only trusted because Caddy is the sole entry point. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

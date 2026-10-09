/** JSON fetch that turns a server `{error}` into a thrown Error with that message. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init?.signal,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok && res.status !== 202) {
    throw new ApiError(json?.error ?? `Request failed (${res.status})`, res.status, json);
  }
  return json as T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}

/** Wallets reject with assorted shapes; this finds a human message, and spots a user cancel. */
export function walletErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  if (/reject|denied|cancel|declined|user closed/i.test(msg)) return "You cancelled the request in your wallet.";
  return msg || "Something went wrong";
}

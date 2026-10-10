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
    throw new ApiError(json?.error ?? `Request failed (${res.status})`, res.status, json, json?.code);
  }
  return json as T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * A human message for any failure. Server errors (ApiError) are shown as the
 * server wrote them; only wallet errors are checked for a user cancel, since
 * a server message like "the network rejected the transaction" is not one.
 */
export function walletErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  const code = typeof err === "object" && err && "code" in err ? (err as { code: unknown }).code : undefined;
  if (code === 4001 || /user rejected|rejected the request|request rejected|cancel|denied|declined|user closed/i.test(msg)) return "You cancelled the request in your wallet.";
  if (err instanceof TypeError && /fetch|network/i.test(msg)) return "Couldn't reach the server. Check your connection and try again.";
  return msg || "Something went wrong";
}

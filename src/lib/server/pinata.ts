import "server-only";
import { env } from "./env";
import { bad } from "./http";

/**
 * Coin images and metadata are pinned to IPFS through Pinata, never stored on
 * this server: content-addressed, and it outlives the site. Every pin's id is
 * kept so takedowns and unused uploads can be unpinned.
 */
async function upload(file: Blob, name: string): Promise<{ cid: string; id: string }> {
  const form = new FormData();
  form.append("network", "public");
  form.append("name", name);
  form.append("file", file, name);
  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.pinataJwt()}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    console.error("pinata:", res.status, (await res.text().catch(() => "")).slice(0, 300));
    return bad("IPFS upload failed. Try again in a moment.", 502);
  }
  const json = (await res.json()) as { data?: { cid?: string; id?: string } };
  if (!json.data?.cid || !json.data.id) return bad("IPFS upload returned no content id", 502);
  return { cid: json.data.cid, id: json.data.id };
}

export const gatewayUrl = (cid: string) => `https://${env.pinataGateway()}/ipfs/${cid}`;

export async function pinFile(file: Blob, name: string): Promise<{ cid: string; id: string; url: string }> {
  const pinned = await upload(file, name);
  return { ...pinned, url: gatewayUrl(pinned.cid) };
}

export async function pinJson(value: unknown, name: string): Promise<{ cid: string; id: string; url: string }> {
  return pinFile(new Blob([JSON.stringify(value)], { type: "application/json" }), name);
}

/** Removes a pin; our gateway stops serving it. True when gone (or already gone). */
export async function unpin(id: string): Promise<boolean> {
  const res = await fetch(`https://api.pinata.cloud/v3/files/public/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${env.pinataJwt()}` },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  return Boolean(res && (res.ok || res.status === 404));
}

/** True for a URL on our own gateway; prepare additionally requires it to be one of our uploads. */
export function isGatewayUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === env.pinataGateway() && /^\/ipfs\/[A-Za-z0-9]{46,100}$/.test(u.pathname);
  } catch {
    return false;
  }
}

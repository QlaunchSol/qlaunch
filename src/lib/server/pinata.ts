import "server-only";
import { env } from "./env";
import { bad } from "./http";

/** Pinata v3 public upload. Returns the content id; the file is then served by our gateway. */
async function upload(file: Blob, name: string): Promise<string> {
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
  const json = (await res.json()) as { data?: { cid?: string } };
  const cid = json.data?.cid;
  if (!cid) return bad("IPFS upload returned no content id", 502);
  return cid;
}

export const gatewayUrl = (cid: string) => `https://${env.pinataGateway()}/ipfs/${cid}`;

export async function pinFile(file: Blob, name: string): Promise<{ cid: string; url: string }> {
  const cid = await upload(file, name);
  return { cid, url: gatewayUrl(cid) };
}

export async function pinJson(value: unknown, name: string): Promise<{ cid: string; url: string }> {
  const cid = await upload(new Blob([JSON.stringify(value)], { type: "application/json" }), name);
  return { cid, url: gatewayUrl(cid) };
}

/** True for an image this server pinned: launches may only reference those. */
export function isGatewayUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === env.pinataGateway() && /^\/ipfs\/[A-Za-z0-9]{46,100}$/.test(u.pathname);
  } catch {
    return false;
  }
}

import "server-only";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { site } from "@/config/site";
import { configured, env } from "./env";
import { bad } from "./http";

/**
 * File storage for coin images and metadata. Production pins to IPFS through
 * Pinata. Without Pinata, and with LOCAL_STORAGE_DIR set, files are stored on
 * this server and served from /files/: for development and devnet only, since
 * such URLs are neither content-addressed nor independent of this server.
 */

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "application/json": "json" };

export const localStorageDir = () => (!configured.pinata() && process.env.LOCAL_STORAGE_DIR) || null;

async function pinataUpload(file: Blob, name: string): Promise<string> {
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
  return json.data?.cid ?? bad("IPFS upload returned no content id", 502);
}

async function store(file: Blob, name: string): Promise<{ cid: string; url: string }> {
  const dir = localStorageDir();
  if (dir) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const id = `${createHash("sha256").update(bytes).digest("hex")}.${EXT[file.type] ?? "bin"}`;
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, id), bytes);
    return { cid: id, url: `${site.url}/files/${id}` };
  }
  const cid = await pinataUpload(file, name);
  return { cid, url: `https://${env.pinataGateway()}/ipfs/${cid}` };
}

export const pinFile = (file: Blob, name: string) => store(file, name);
export const pinJson = (value: unknown, name: string) => store(new Blob([JSON.stringify(value)], { type: "application/json" }), name);

/** True for a file this server stored: launches may only reference those. */
export function isGatewayUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (localStorageDir()) return u.origin === new URL(site.url).origin && /^\/files\/[0-9a-f]{64}\.(png|jpg|gif|webp)$/.test(u.pathname);
    return u.protocol === "https:" && u.hostname === env.pinataGateway() && /^\/ipfs\/[A-Za-z0-9]{46,100}$/.test(u.pathname);
  } catch {
    return false;
  }
}

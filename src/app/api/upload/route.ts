import { createHash } from "node:crypto";
import { rateLimit } from "@/lib/server/cache";
import { similarImage } from "@/lib/image-hash";
import { blockedImages, insertUpload, uploadBySha, uploadCounts } from "@/lib/server/db";
import { configured } from "@/lib/server/env";
import { bad, clientIp, ipHash, readBody, route } from "@/lib/server/http";
import { sanitizeImage } from "@/lib/server/images";
import { screenImage } from "@/lib/server/moderation";
import { pinFile } from "@/lib/server/pinata";

const MAX_BYTES = 4 * 1024 * 1024;
const PER_CLIENT_PER_DAY = 30;
const PER_DAY = () => Number(process.env.UPLOADS_PER_DAY ?? 300);

/**
 * POST multipart {file} → {url}. The image is decoded and re-encoded (see
 * images.ts) before it is pinned; nothing is stored on this server. Uploads
 * nobody launches with are unpinned after a few hours (jobs.ts), so this
 * can't serve as free image hosting. Images moderation has taken down, and
 * near copies of them, are refused; so is anything automated screening flags.
 */
export const POST = route(async (request) => {
  if (!configured.pinata()) bad("Image uploads aren't configured on this server yet.", 503);
  const ip = clientIp(request);
  await rateLimit(`upload:${ip}`, 12, 600, { failClosed: true });
  const hash = ipHash(ip);
  const counts = await uploadCounts(hash);
  if (counts.mine >= PER_CLIENT_PER_DAY) bad("You've uploaded a lot of images today. Try again tomorrow.", 429);
  if (counts.all >= PER_DAY()) bad("Uploads are paused for today. Try again later.", 503);

  // multipart overhead on top of the image itself
  const raw = await readBody(request, MAX_BYTES + 64_000);
  const form = await new Response(new Blob([new Uint8Array(raw)]), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData().catch(() => bad("Expected a file upload"));
  const file = form.get("file");
  if (!(file instanceof Blob)) bad("Expected a file upload");
  if ((file as Blob).size > MAX_BYTES) bad("Image must be 4 MB or smaller", 413);
  const clean = await sanitizeImage(new Uint8Array(await (file as Blob).arrayBuffer()));

  const sha256 = createHash("sha256").update(clean.bytes).digest("hex");
  const blocked = await blockedImages();
  if (blocked.some((b) => b.sha256 === sha256 || similarImage(b.dhash, clean.dhash))) bad("This image was removed by moderation and can't be used.", 422, "image_blocked");
  await screenImage(clean.bytes); // refuses anything unsafe (OpenAI moderation)
  const known = await uploadBySha(sha256);
  if (known) return Response.json({ url: known.url, width: clean.width, height: clean.height });
  const pinned = await pinFile(new Blob([new Uint8Array(clean.bytes)], { type: clean.type }), "coin.webp");
  await insertUpload({ cid: pinned.cid, pin_id: pinned.id, url: pinned.url, sha256, dhash: clean.dhash, ip_hash: hash });
  return Response.json({ url: pinned.url, width: clean.width, height: clean.height });
});

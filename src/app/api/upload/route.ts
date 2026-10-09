import { rateLimit } from "@/lib/server/cache";
import { bad, clientIp, route } from "@/lib/server/http";
import { pinFile } from "@/lib/server/pinata";

const MAX_BYTES = 4 * 1024 * 1024;

/** Identifies the image by its first bytes; the declared content type is not trusted. */
function sniff(b: Uint8Array): { type: string; ext: string } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: "image/png", ext: "png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { type: "image/gif", ext: "gif" };
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

/** POST multipart {file} → {url} on our IPFS gateway. */
export const POST = route(async (request) => {
  await rateLimit(`upload:${clientIp(request)}`, 20, 3600);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES + 64_000) bad("Image must be 4 MB or smaller", 413);
  const form = await request.formData().catch(() => bad("Expected a file upload"));
  const file = form.get("file");
  if (!(file instanceof Blob)) bad("Expected a file upload");
  const blob = file as Blob;
  if (blob.size > MAX_BYTES) bad("Image must be 4 MB or smaller", 413);
  if (blob.size < 64) bad("That file is too small to be an image");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const kind = sniff(bytes) ?? bad("Use a PNG, JPEG, GIF or WebP image");
  const { url } = await pinFile(new Blob([bytes], { type: kind.type }), `coin.${kind.ext}`);
  return Response.json({ url });
});

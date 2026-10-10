import "server-only";
import sharp, { type Metadata } from "sharp";
import { DHASH_HEIGHT, DHASH_WIDTH, dhashFromPixels } from "@/lib/image-hash";
import { bad } from "./http";

/**
 * Every uploaded image is decoded and re-encoded before it is pinned:
 * - decoding with a pixel cap rejects decompression bombs and non-images;
 * - re-encoding destroys anything smuggled alongside the pixels (polyglot
 *   files that are also HTML, ZIP, scripts);
 * - EXIF and other metadata (GPS positions in phone photos) are dropped,
 *   after applying the EXIF orientation so photos stay upright;
 * - output is a bounded WebP: 1024 px static, 512 px animated;
 * - a perceptual hash of the result lets moderation block near copies.
 */
sharp.cache(false); // a 1 GB machine: don't keep decoded images around
sharp.concurrency(1);

const MAX_INPUT_PIXELS = 25_000_000; // e.g. 5000 × 5000
const MAX_FRAMES = 200;
const ALLOWED = new Set(["png", "jpeg", "gif", "webp"]);

// One image at a time: decoding is the memory-heavy part.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

export type CleanImage = { bytes: Buffer; type: "image/webp"; width: number; height: number; animated: boolean; dhash: string };

export function sanitizeImage(input: Uint8Array): Promise<CleanImage> {
  return serial(async () => {
    let meta: Metadata;
    try {
      meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).metadata();
    } catch (err) {
      if (/pixel limit/i.test(String((err as Error)?.message))) return bad("That image is too large (max 25 megapixels)");
      return bad("That file isn't a readable image");
    }
    if (!meta.format || !ALLOWED.has(meta.format)) bad("Use a PNG, JPEG, GIF or WebP image");
    if (!meta.width || !meta.height) bad("That image has no size");
    if ((meta.width * meta.height) > MAX_INPUT_PIXELS) bad("That image is too large (max 25 megapixels)");
    const frames = meta.pages ?? 1;
    if (frames > MAX_FRAMES) bad(`Animations can have at most ${MAX_FRAMES} frames`);
    const animated = frames > 1;
    const side = animated ? 512 : 1024;
    try {
      const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated })
        .rotate()
        .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
        .webp({ quality: animated ? 80 : 88, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      if (data.length > 3 * 1024 * 1024) bad("That image is too large after processing. Try a smaller or shorter one.");
      // First frame, transparency on white, squashed to 9×8 greyscale.
      const grey = await sharp(data).flatten({ background: "#ffffff" }).greyscale().resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: "fill" }).raw().toBuffer();
      return { bytes: data, type: "image/webp", width: info.width, height: info.pageHeight ?? info.height, animated, dhash: dhashFromPixels(grey) };
    } catch (err) {
      if ((err as { status?: number })?.status) throw err;
      return bad("That image couldn't be processed. Try saving it as PNG or JPEG.");
    }
  });
}

/**
 * Difference hashes (dHash): an image shrunk to 9×8 greyscale, one bit per
 * pair of horizontal neighbours (is the right one brighter?). Re-encoding,
 * resizing, recolouring slightly or adding a little noise flips few bits, so
 * a small Hamming distance means "the same picture".
 */
export const DHASH_WIDTH = 9;
export const DHASH_HEIGHT = 8;

/** 72 greyscale bytes (9×8, row-major) → 16 hex characters. */
export function dhashFromPixels(px: Uint8Array): string {
  if (px.length !== DHASH_WIDTH * DHASH_HEIGHT) throw new Error("dhash: expected 9×8 greyscale pixels");
  let hex = "";
  for (let y = 0; y < DHASH_HEIGHT; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (px[y * DHASH_WIDTH + x] < px[y * DHASH_WIDTH + x + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

const popcount = (n: number) => {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
};

export function hammingDistance(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i += 2) d += popcount(parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16));
  return d;
}

/**
 * Near-identical pictures. Flat or smooth images (a plain colour, a simple
 * gradient) hash to nearly all zeros or ones and would collide with each
 * other, so such hashes only ever match exactly by bytes, not perceptually.
 */
export function similarImage(blocked: string | null | undefined, candidate: string): boolean {
  if (!blocked || !/^[0-9a-f]{16}$/.test(blocked) || !/^[0-9a-f]{16}$/.test(candidate)) return false;
  const ones = hammingDistance(blocked, "0000000000000000");
  if (ones < 8 || ones > 56) return false;
  // Unrelated pictures sit around 32 bits apart; re-encodes, resizes and small crops or overlays within ~10.
  return hammingDistance(blocked, candidate) <= 10;
}

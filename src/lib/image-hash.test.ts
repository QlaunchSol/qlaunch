import { describe, expect, it } from "vitest";
import { dhashFromPixels, hammingDistance, similarImage } from "./image-hash";

const pixels = (f: (x: number, y: number) => number) => Uint8Array.from({ length: 72 }, (_, i) => f(i % 9, Math.floor(i / 9)));
const pattern = (x: number, y: number) => (((x * 37 + y * 101) % 97) * 2) & 255;

describe("dhash", () => {
  it("is 16 hex chars and ignores uniform brightness changes", () => {
    const a = dhashFromPixels(pixels(pattern));
    const b = dhashFromPixels(pixels((x, y) => Math.min(255, pattern(x, y) + 20) >> 0));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hammingDistance(a, b)).toBeLessThanOrEqual(6);
  });

  it("matches near copies but not different pictures", () => {
    const a = dhashFromPixels(pixels(pattern));
    const flipped = dhashFromPixels(pixels((x, y) => pattern(8 - x, y)));
    expect(similarImage(a, a)).toBe(true);
    expect(similarImage(a, flipped)).toBe(false);
  });

  it("never matches flat images perceptually", () => {
    const flat = dhashFromPixels(pixels(() => 128));
    expect(flat).toBe("0000000000000000");
    expect(similarImage(flat, flat)).toBe(false);
    expect(similarImage(null, flat)).toBe(false);
  });
});

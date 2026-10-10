// Feeds hostile inputs to the upload image sanitizer.
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/check-image-sanitizer.mts
import sharp from "sharp";
import { sanitizeImage } from "../src/lib/server/images.ts";
const cases: [string, () => Promise<Buffer>][] = [
  ["polyglot PNG+HTML", async () => Buffer.concat([await sharp({ create: { width: 300, height: 300, channels: 3, background: "#5ef0b6" } }).png().toBuffer(), Buffer.from("<html><script>alert(document.cookie)</script></html>")])],
  ["decompression bomb 12000x12000", async () => sharp({ create: { width: 12000, height: 12000, channels: 3, background: "#000" } }).png({ compressionLevel: 9 }).toBuffer()],
  ["phone photo w/ GPS + orientation", async () => sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#8fb8ff" } }).jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Make: "TestPhone", Model: "X" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" } } }).toBuffer()],
  ["animated GIF (3 frames)", async () => sharp(await Promise.all(["#f2c46d", "#5ef0b6", "#8fb8ff"].map((c) => sharp({ create: { width: 900, height: 900, channels: 3, background: c } }).png().toBuffer())), { join: { animated: true } }).gif({ loop: 0 }).toBuffer()],
  ["text file named .png", async () => Buffer.from("just some text, not an image ".repeat(20))],
];
for (const [name, make] of cases) {
  const input = await make();
  try {
    const out = await sanitizeImage(input);
    const m = await sharp(out.bytes, { animated: true }).metadata();
    const tail = out.bytes.includes(Buffer.from("<script>")) ? "SCRIPT STILL PRESENT" : "no trailing payload";
    console.log(`✓ ${name}: ${input.length}B → webp ${out.bytes.length}B ${out.width}x${out.height}${out.animated ? " animated " + m.pages + " frames" : ""} | exif ${m.exif ? "PRESENT" : "stripped"} | ${tail}`);
  } catch (e) {
    console.log(`✗ ${name}: refused: ${(e as Error).message}`);
  }
}

// Near copies of a taken-down image should match its perceptual hash; other pictures shouldn't.
const { hammingDistance, similarImage } = await import("../src/lib/image-hash.ts");
// A logo-like picture: a few coloured shapes and a word on a background.
const textured = (seed: number) => {
  const r = (n: number) => { const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  const shapes = Array.from({ length: 7 }, (_, i) => `<circle cx="${(r(i) * 800) | 0}" cy="${(r(i + 10) * 800) | 0}" r="${(60 + r(i + 20) * 160) | 0}" fill="hsl(${(r(i + 30) * 360) | 0},70%,${(35 + r(i + 40) * 40) | 0}%)"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="hsl(${(r(99) * 360) | 0},40%,20%)"/>${shapes}<text x="80" y="700" font-size="120" font-family="sans-serif" fill="#fff">COIN${seed}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};
const original = await sanitizeImage(await textured(1));
const variants: [string, () => Promise<Buffer>, boolean][] = [
  ["same image as JPEG q60", async () => sharp(await textured(1)).jpeg({ quality: 60 }).toBuffer(), true],
  ["resized to 70%", async () => sharp(await textured(1)).resize(560).png().toBuffer(), true],
  ["brightened 15%", async () => sharp(await textured(1)).modulate({ brightness: 1.15 }).png().toBuffer(), true],
  ["cropped 3% each side", async () => sharp(await textured(1)).extract({ left: 24, top: 24, width: 752, height: 752 }).png().toBuffer(), true],
  ["a different picture (2)", async () => textured(2), false],
  ["a different picture (4)", async () => textured(4), false],
  ["with a small watermark", async () => sharp(await textured(1)).composite([{ input: await sharp({ create: { width: 120, height: 40, channels: 3, background: "#ffffff" } }).png().toBuffer(), left: 660, top: 740 }]).png().toBuffer(), true],
  ["a different picture", async () => textured(3), false],
  ["mirrored", async () => sharp(await textured(1)).flop().png().toBuffer(), false],
];
for (const [name, make, expected] of variants) {
  const v = await sanitizeImage(await make());
  const hit = similarImage(original.dhash, v.dhash);
  console.log(`${hit === expected ? "✓" : "✗"} ${name}: distance ${hammingDistance(original.dhash, v.dhash)} → ${hit ? "blocked" : "allowed"}`);
}

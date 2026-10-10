// Brand images (social preview, X header, GitHub preview, avatar, app icon) drawn in the site's own style;
// the hash-chain grid is the real test vector's signature digits. Writes one HTML file per image plus
// sizes.txt; render each at its size with any headless browser (e.g. Playwright screenshot).
//   node scripts/brand-assets.mjs scripts/vectors/launch.json <outdir>
import { readFileSync, writeFileSync } from "node:fs";
const [vectorsPath, out] = process.argv.slice(2);
const digest = JSON.parse(readFileSync(vectorsPath, "utf8"))[0].digest;
const msg = [...digest].map((c) => parseInt(c, 16));
let csum = msg.reduce((s, d) => s + 15 - d, 0) << 4;
const digits = [...msg, (csum >> 12) & 15, (csum >> 8) & 15, (csum >> 4) & 15];

const M = "#5ef0b6";
const mark = (size, tile = true) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32">${tile ? `<rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#0e2a20" stroke="${M}" stroke-opacity="0.35"/>` : ""}<circle cx="14" cy="14" r="7.4" fill="none" stroke="${M}" stroke-width="3.4"/><rect x="18.6" y="18.6" width="5" height="5" rx="1.1" fill="${M}" fill-opacity="0.55"/><rect x="22.8" y="22.8" width="5" height="5" rx="1.1" fill="${M}"/></svg>`;

// The site's WOTS chain grid: 67 chains, position 0 at the bottom; signature cell in ice, walked cells mint.
function grid(cell, gap, cols = 67) {
  const w = cols * (cell + gap) - gap, h = 16 * (cell + gap) - gap;
  let rects = "";
  digits.slice(0, cols).forEach((d, i) => {
    for (let p = 0; p < 16; p++) {
      const x = i * (cell + gap), y = h - (p + 1) * (cell + gap) + gap;
      let fill = "#161d22";
      if (p === d) fill = i >= 64 ? "#f2c46d" : "#8fb8ff";
      else if (p > d) fill = p === 15 ? M : "rgba(94,240,182,.42)";
      rects += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${cell * 0.2}" fill="${fill}"/>`;
    }
  });
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rects}</svg>`;
}

const head = (w, h) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{background:radial-gradient(900px 420px at 78% -8%, rgba(94,240,182,.13), transparent 60%),radial-gradient(700px 360px at 0% 110%, rgba(143,184,255,.07), transparent 60%),#07090b;color:#e8edf0;font-family:Geist,sans-serif;position:relative}
.lattice{position:absolute;inset:0;background-image:linear-gradient(to right,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.035) 1px,transparent 1px);background-size:28px 28px;mask-image:radial-gradient(ellipse at 60% 40%,black 25%,transparent 78%)}
.mono{font-family:'Geist Mono',monospace}
.mint{color:${M}}
.panel{background:rgba(12,16,19,.92);border:1px solid #1c242a;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.45)}
.word{display:flex;align-items:center;gap:18px;font-weight:600;letter-spacing:-.02em}
</style></head><body><div class="lattice"></div>`;

const verifyPanel = (scale) => `<div class="panel" style="padding:${22 * scale}px ${24 * scale}px">
  <div class="mono" style="display:flex;justify-content:space-between;font-size:${13 * scale}px;color:#5f6c75;margin-bottom:${16 * scale}px"><span>wots verify</span><span class="mint">● in your browser</span></div>
  ${grid(6 * scale, 2 * scale)}
  <div class="mono" style="margin-top:${16 * scale}px;border:1px solid rgba(94,240,182,.4);background:rgba(94,240,182,.06);border-radius:${8 * scale}px;padding:${9 * scale}px ${12 * scale}px;font-size:${13 * scale}px" ><span class="mint">root matches: signature valid</span></div>
</div>`;

const files = {
  // Social preview for links (1200×630) and GitHub (1280×640).
  og: [1200, 630, `
    <div style="position:absolute;left:72px;top:70px;right:72px;bottom:64px;display:flex;justify-content:space-between;align-items:center;gap:48px">
      <div style="width:480px;flex:none">
        <div class="word" style="font-size:40px">${mark(58)}Qlaunch</div>
        <div style="margin-top:44px;font-size:52px;line-height:1.06;font-weight:600;letter-spacing:-.035em;white-space:nowrap">Launch coins that<br><span class="mint">outlive the curve.</span></div>
        <div style="margin-top:22px;font-size:21px;line-height:1.45;color:#95a2ab">pump.fun launches signed by hash&#8209;based, post&#8209;quantum one&#8209;time keys. Verifiable with SHA-256 alone.</div>
        <div class="mono" style="margin-top:34px;font-size:20px;color:#5f6c75">qlaunch.xyz</div>
      </div>
      <div style="flex:none">${verifyPanel(0.86)}</div>
    </div>`],
  github: [1280, 640, null],
  // X header 1500×500: avatar covers the lower left, so content sits right of it.
  xheader: [1500, 500, `
    <div style="position:absolute;left:470px;right:70px;top:0;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:40px">
      <div>
        <div class="word" style="font-size:26px;margin-bottom:22px">${mark(38)}Qlaunch</div>
        <div style="font-size:46px;line-height:1.06;font-weight:600;letter-spacing:-.035em;white-space:nowrap">Launch coins that<br><span class="mint">outlive the curve.</span></div>
        <div style="margin-top:20px;font-size:20px;color:#95a2ab">Post-quantum attestations for pump.fun</div>
        <div class="mono" style="margin-top:16px;font-size:18px;color:#5f6c75">qlaunch.xyz</div>
      </div>
      <div style="flex:none">${verifyPanel(0.78)}</div>
    </div>`],
  // Avatar 400×400 (X and GitHub crop to a circle): the mark alone, centered.
  avatar: [400, 400, `
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 42%, #10372a 0%, #0a1a14 55%, #07090b 100%)">${mark(300, false)}</div>`],
  // Apple touch icon 180×180, full bleed (iOS rounds the corners itself).
  apple: [180, 180, `
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0e2a20">${mark(150, false)}</div>`],
  logo512: [512, 512, `<div style="position:absolute;inset:0;background:#07090b"></div><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${mark(512)}</div>`],
};
files.github = [1280, 640, files.og[2].replace("left:72px;top:70px;right:72px;bottom:64px", "left:96px;top:86px;right:96px;bottom:80px")];
for (const [name, [w, h, html]] of Object.entries(files)) writeFileSync(`${out}/${name}.html`, head(w, h) + html + "</body></html>");
writeFileSync(`${out}/sizes.txt`, Object.entries(files).map(([n, [w, h]]) => `${n} ${w} ${h}`).join("\n") + "\n");
console.log(Object.keys(files).join(" "));

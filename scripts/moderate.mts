/**
 * Moderation from the command line (run on the server, with .env.production loaded).
 *
 *   npx tsx scripts/moderate.mts reports              open reports, grouped by coin
 *   npx tsx scripts/moderate.mts takedown <mint> [note] hide the coin, unpin its image and metadata, and
 *                                                       block the image (and near copies) from being uploaded again
 *   npx tsx scripts/moderate.mts hide <mint>          hide from this site only (pins stay)
 *   npx tsx scripts/moderate.mts show <mint>          undo hide (a takedown's unpinned files are gone)
 *   npx tsx scripts/moderate.mts resolve <mint> <note> close its reports without action
 *   npx tsx scripts/moderate.mts list                 hidden coins
 *   npx tsx scripts/moderate.mts blocked              blocked images
 *   npx tsx scripts/moderate.mts unblock <sha256>     allow a blocked image again
 *
 * The coin itself lives on pump.fun regardless; this controls what we display
 * and what our IPFS account keeps serving. Changes show within ~10 s (cache).
 */
import { createHash } from "node:crypto";
import postgres from "postgres";
import sharp from "sharp";
import { DHASH_HEIGHT, DHASH_WIDTH, dhashFromPixels } from "../src/lib/image-hash.ts";

const [action, mint, ...rest] = process.argv.slice(2);
const note = rest.join(" ");
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

async function unpin(pinId: string | null | undefined, what: string) {
  if (!pinId) return console.log(`  ${what}: no pin id recorded`);
  const res = await fetch(`https://api.pinata.cloud/v3/files/public/${pinId}`, { method: "DELETE", headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` } });
  console.log(`  ${what}: ${res.ok ? "unpinned" : `unpin failed (${res.status})`}`);
}

/** sha256 and perceptual hash of a pinned image, as the upload route computes them. */
async function fingerprint(url: string): Promise<{ sha256: string; dhash: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    const grey = await sharp(bytes).flatten({ background: "#ffffff" }).greyscale().resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: "fill" }).raw().toBuffer();
    return { sha256: createHash("sha256").update(bytes).digest("hex"), dhash: dhashFromPixels(grey) };
  } catch {
    return null;
  }
}

switch (action) {
  case "reports": {
    const rows = await sql`
      select r.mint, l.name, l.symbol, l.hidden, count(*)::int as n, array_agg(distinct r.reason) as reasons,
             max(r.created_at) as last, array_remove(array_agg(nullif(r.details, '')), null) as details
      from reports r join launches l using (mint)
      where r.resolved_at is null group by r.mint, l.name, l.symbol, l.hidden order by n desc, last desc`;
    if (!rows.length) console.log("no open reports");
    for (const r of rows) {
      console.log(`${r.n}× ${r.reasons.join(",")}  ${r.name} ($${r.symbol})${r.hidden ? " [hidden]" : ""}\n   https://qlaunch.xyz/coin/${r.mint}`);
      for (const d of r.details.slice(0, 3)) console.log(`   “${d}”`);
    }
    break;
  }
  case "takedown": {
    const [launch] = await sql`update launches set hidden = true where mint = ${mint} returning name, symbol, image_url, metadata_pin_id`;
    if (!launch) {
      console.log("no such launch");
      break;
    }
    console.log(`taken down: ${launch.name} ($${launch.symbol})`);
    const [upload] = await sql`select pin_id, sha256, dhash from uploads where url = ${launch.image_url}`;
    const print = upload?.dhash ? { sha256: upload.sha256, dhash: upload.dhash } : await fingerprint(launch.image_url);
    if (print) {
      await sql`insert into blocked_images ${sql({ ...print, note: `${mint}${note ? `: ${note}` : ""}` })} on conflict (sha256) do nothing`;
      console.log(`  image: blocked from re-upload (undo: moderate.mts unblock ${print.sha256})`);
    } else console.log("  image: couldn't fingerprint it, NOT blocked");
    const shared = await sql`select 1 from launches where image_url = ${launch.image_url} and mint <> ${mint} and not hidden limit 1`;
    if (shared.length) console.log("  image: also used by another visible coin, left pinned");
    else await unpin(upload?.pin_id, "image");
    await unpin(launch.metadata_pin_id, "metadata");
    if (upload && !shared.length) await sql`delete from uploads where url = ${launch.image_url}`;
    const resolved = await sql`update reports set resolved_at = now(), resolution = ${"takedown" + (note ? `: ${note}` : "")} where mint = ${mint} and resolved_at is null returning id`;
    console.log(`  reports closed: ${resolved.length}`);
    break;
  }
  case "resolve": {
    const resolved = await sql`update reports set resolved_at = now(), resolution = ${note || "no action"} where mint = ${mint} and resolved_at is null returning id`;
    console.log(`reports closed: ${resolved.length}`);
    break;
  }
  case "hide":
  case "show": {
    const rows = await sql`update launches set hidden = ${action === "hide"} where mint = ${mint} returning name, symbol`;
    console.log(rows.length ? `${action === "hide" ? "hidden" : "visible"}: ${rows[0].name} ($${rows[0].symbol})` : "no such launch");
    break;
  }
  case "list": {
    for (const r of await sql`select mint, name, symbol from launches where hidden order by created_at desc`) console.log(`${r.mint}  ${r.symbol}  ${r.name}`);
    break;
  }
  case "blocked": {
    for (const r of await sql`select sha256, note, created_at from blocked_images order by created_at desc`) console.log(`${r.sha256}  ${r.created_at.toISOString().slice(0, 10)}  ${r.note}`);
    break;
  }
  case "unblock": {
    const rows = await sql`delete from blocked_images where sha256 = ${mint} returning sha256`;
    console.log(rows.length ? "unblocked" : "not blocked");
    break;
  }
  default:
    console.log("usage: moderate.mts reports | takedown <mint> [note] | hide <mint> | show <mint> | resolve <mint> <note> | list | blocked | unblock <sha256>");
}
await sql.end();

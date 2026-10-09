/**
 * Hides a coin from this site (grid, coin page, metadata proxy, stats), or
 * shows it again. The coin itself lives on pump.fun regardless: this only
 * controls what we display. Takes effect within ~10 s (cache TTL).
 *
 *   DATABASE_URL=… npx tsx scripts/moderate.mts hide <mint>
 *   DATABASE_URL=… npx tsx scripts/moderate.mts show <mint>
 *   DATABASE_URL=… npx tsx scripts/moderate.mts list
 */
import postgres from "postgres";

const [action, mint] = process.argv.slice(2);
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
if (action === "list") {
  for (const r of await sql`select mint, name, symbol, created_at from launches where hidden order by created_at desc`) console.log(`${r.mint}  ${r.symbol}  ${r.name}`);
} else if ((action === "hide" || action === "show") && mint) {
  const rows = await sql`update launches set hidden = ${action === "hide"} where mint = ${mint} returning name, symbol`;
  console.log(rows.length ? `${action === "hide" ? "hidden" : "visible"}: ${rows[0].name} ($${rows[0].symbol})` : "no such launch");
} else {
  console.log("usage: moderate.mts hide|show <mint> | list");
}
await sql.end();

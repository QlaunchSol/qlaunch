/**
 * Applies db/migrations/*.sql in order, each once, each in a transaction.
 *   DATABASE_URL=postgres://… npx tsx scripts/migrate.mts
 */
import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const dir = new URL("../db/migrations/", import.meta.url);
await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(name)) continue;
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(new URL(name, dir), "utf8"));
    await tx`insert into schema_migrations (name) values (${name})`;
  });
  console.log(`applied ${name}`);
}
console.log("schema up to date");
await sql.end();

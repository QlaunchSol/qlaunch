import "server-only";
import postgres from "postgres";
import { identityFromHex, type PublicIdentity } from "@/lib/pq";
import { env } from "./env";
import { bad } from "./http";

/**
 * PostgreSQL on this machine, accessed directly. Every query the app makes
 * lives in this file.
 */
// One pool per process, shared across Next.js bundles (instrumentation and
// each route are compiled separately and would otherwise each open their own).
const g = globalThis as typeof globalThis & { __sql?: postgres.Sql };

export function sql(): postgres.Sql {
  if (!g.__sql) {
    g.__sql = postgres(env.databaseUrl(), {
      max: 5,
      idle_timeout: 60,
      onnotice: () => {},
      types: {
        // ids are small; numbers, not strings
        bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
        // timestamps as ISO strings, the shape the API returns
        date: { to: 1184, from: [1082, 1114, 1184], serialize: (x: string | Date) => new Date(x).toISOString(), parse: (x: string) => new Date(x).toISOString() },
      },
    });
  }
  return g.__sql;
}

export type IdentityRow = {
  id: number;
  wallet: string;
  pq_address: string;
  root: string;
  pub_seed: string;
  height: number;
  epoch: number;
  statement: string;
  wallet_signature: string;
  registration_signature: string;
  anchor_tx: string | null;
  anchor_slot: number | null;
  anchored_at: string | null;
  created_at: string;
};

export type LaunchRow = {
  mint: string;
  identity_id: number;
  creator: string;
  pq_address: string;
  leaf: number;
  name: string;
  symbol: string;
  description: string;
  image_url: string;
  metadata_uri: string;
  twitter: string;
  telegram: string;
  website: string | null;
  digest: string;
  signature: string;
  dev_buy_sol: string;
  status: "pending" | "live" | "failed";
  tx_signature: string | null;
  created_at: string;
  launched_at: string | null;
  hidden: boolean;
  metadata_pin_id: string | null;
  dev_tokens: string | null;
  failure_reason: string | null;
};

export type CoinRow = Pick<
  LaunchRow,
  "mint" | "name" | "symbol" | "description" | "image_url" | "metadata_uri" | "twitter" | "telegram" | "creator" | "pq_address" | "leaf" | "dev_tokens" | "tx_signature" | "created_at" | "launched_at"
> & {
  price_usd: number | null;
  market_cap_usd: number | null;
  volume_24h_usd: number | null;
  holders: number | null;
  curve_progress: number | null;
  complete: boolean;
  market_updated_at: string | null;
};

const UNIQUE_VIOLATION = "23505";
const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === UNIQUE_VIOLATION;

// ── identities ───────────────────────────────────────────────────────────────

export async function identityByWallet(wallet: string): Promise<IdentityRow | null> {
  const [row] = await sql()<IdentityRow[]>`select * from identities where wallet = ${wallet}`;
  return row ?? null;
}

export async function identityByAddress(address: string): Promise<IdentityRow | null> {
  const [row] = await sql()<IdentityRow[]>`select * from identities where pq_address = ${address}`;
  return row ?? null;
}

export function publicIdentity(row: IdentityRow): PublicIdentity {
  const id = identityFromHex({ root: row.root, pubSeed: row.pub_seed, height: row.height, epoch: row.epoch });
  if (!id) throw new Error(`corrupt identity row ${row.id}`);
  return id;
}

/** Inserts an identity; null if the wallet or address is already registered. */
export async function insertIdentity(r: Pick<IdentityRow, "wallet" | "pq_address" | "root" | "pub_seed" | "height" | "epoch" | "statement" | "wallet_signature" | "registration_signature">) {
  try {
    const [row] = await sql()<IdentityRow[]>`insert into identities ${sql()(r)} returning *`;
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

export async function setAnchor(id: number, tx: string, slot: number, at: string): Promise<IdentityRow> {
  const [row] = await sql()<IdentityRow[]>`update identities set anchor_tx = ${tx}, anchor_slot = ${slot}, anchored_at = ${at} where id = ${id} returning *`;
  return row;
}

// ── one-time keys ────────────────────────────────────────────────────────────

export function usedLeaves(identityId: number) {
  return sql()<{ leaf: number; purpose: string; ref: string | null; digest: string; created_at: string }[]>`
    select leaf, purpose, ref, digest, created_at from leaf_uses where identity_id = ${identityId} order by leaf`;
}

/**
 * Spends a one-time key. 'ok' = first use; 'same' = this exact digest already
 * spent it (a retried request); anything else refuses the request.
 */
export async function burnLeaf(p: { identityId: number; leaf: number; purpose: "register" | "launch" | "prove"; digest: string; ref: string | null }): Promise<"ok" | "same"> {
  const [{ result }] = await sql()<{ result: string }[]>`select burn_leaf(${p.identityId}, ${p.leaf}::smallint, ${p.purpose}, ${p.digest}, ${p.ref}) as result`;
  if (result === "ok" || result === "same") return result;
  return bad(`One-time key #${p.leaf} was already used. Refresh and try again with the next key.`, 409);
}

// ── launches ─────────────────────────────────────────────────────────────────

export async function launchByMint(mint: string): Promise<LaunchRow | null> {
  const [row] = await sql()<LaunchRow[]>`select * from launches where mint = ${mint}`;
  return row ?? null;
}

export function launchesOfIdentity(identityId: number) {
  return sql()<{ mint: string; name: string; symbol: string; image_url: string; leaf: number; status: string; created_at: string; launched_at: string | null }[]>`
    select mint, name, symbol, image_url, leaf, status, created_at, launched_at
    from launches where identity_id = ${identityId} order by created_at desc limit 100`;
}

/**
 * Deletes an identity that has no live or in-flight coins (checked by the
 * caller, and again here under a row lock): its spent keys move to
 * retired_leaves, its failed launches and proofs go. Returns the metadata pins
 * of those launches, to unpin. Null if it has a launch that isn't failed.
 */
export async function resetIdentity(identity: IdentityRow): Promise<string[] | null> {
  return sql().begin(async (tx) => {
    await tx`select id from identities where id = ${identity.id} for update`;
    const [busy] = await tx`select 1 from launches where identity_id = ${identity.id} and status <> 'failed' limit 1`;
    if (busy) return null;
    await tx`
      insert into retired_leaves (pq_address, leaf, purpose, digest, ref, created_at)
      select ${identity.pq_address}, leaf, purpose, digest, ref, created_at from leaf_uses where identity_id = ${identity.id}
      on conflict do nothing`;
    const launches = await tx<{ metadata_pin_id: string | null; image_url: string }[]>`
      delete from launches where identity_id = ${identity.id} returning metadata_pin_id, image_url`;
    for (const l of launches) {
      await tx`update uploads set used_at = null where url = ${l.image_url}
        and not exists (select 1 from launches o where o.image_url = uploads.url and o.status in ('live', 'pending'))`;
    }
    await tx`delete from identities where id = ${identity.id}`; // leaf_uses and proofs cascade
    return launches.map((l) => l.metadata_pin_id).filter((x): x is string => Boolean(x));
  });
}

/** Re-registering a reset identity: its previously spent keys are spent again. */
export async function restoreRetiredLeaves(identityId: number, pqAddress: string) {
  await sql()`
    insert into leaf_uses (identity_id, leaf, purpose, digest, ref, created_at)
    select ${identityId}, leaf, purpose, digest, ref, created_at from retired_leaves where pq_address = ${pqAddress}
    on conflict do nothing`;
}

/** Marks a pending launch failed (it can no longer land). */
export async function failLaunch(mint: string, reason: string) {
  await sql()`update launches set status = 'failed', failure_reason = ${reason} where mint = ${mint} and status = 'pending'`;
}

/** Inserts a pending launch; false if the mint or (identity, leaf) is already taken. */
export async function insertLaunch(
  r: Omit<LaunchRow, "status" | "tx_signature" | "created_at" | "launched_at" | "hidden" | "dev_buy_sol" | "dev_tokens" | "failure_reason"> & { dev_buy_sol: number },
): Promise<boolean> {
  try {
    await sql()`insert into launches ${sql()(r)}`;
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

/** Marks a launch live, with the creation transaction and the dev buy as landed; true if this call made the change. */
export async function setLive(mint: string, txSignature: string, devTokens: number): Promise<boolean> {
  const rows = await sql()`
    update launches set status = 'live', tx_signature = ${txSignature}, dev_tokens = ${devTokens}, launched_at = now(), failure_reason = null
    where mint = ${mint} and status <> 'live' returning mint`;
  if (rows.length) await sql()`update uploads set used_at = coalesce(used_at, now()) where url = (select image_url from launches where mint = ${mint})`;
  return rows.length > 0;
}

/** A launch whose on-chain state can never match its attestation: never listed. */
export async function setFailed(mint: string, reason: string) {
  await sql()`update launches set status = 'failed', failure_reason = ${reason.slice(0, 500)} where mint = ${mint} and status <> 'live'`;
}

export function pendingLaunchesSince(since: string) {
  return sql()<LaunchRow[]>`select * from launches where status = 'pending' and created_at >= ${since} order by created_at desc limit 100`;
}

/** Pending launches that never landed: failed, and their metadata pins returned for unpinning. */
export async function failLaunchesBefore(before: string): Promise<{ mint: string; metadata_pin_id: string | null }[]> {
  return sql()<{ mint: string; metadata_pin_id: string | null }[]>`
    update launches set status = 'failed', failure_reason = coalesce(failure_reason, 'never landed on chain')
    where status = 'pending' and created_at < ${before} returning mint, metadata_pin_id`;
}

export async function liveMints(limit = 1000): Promise<string[]> {
  const rows = await sql()<{ mint: string }[]>`select mint from launches where status = 'live' and not hidden order by launched_at desc limit ${limit}`;
  return rows.map((r) => r.mint);
}

export async function setHidden(mint: string, hidden: boolean): Promise<boolean> {
  const rows = await sql()`update launches set hidden = ${hidden} where mint = ${mint} returning mint`;
  return rows.length > 0;
}

// ── coins (live, visible launches joined with market data) ───────────────────

const SORT_COLUMNS = { new: "launched_at", mcap: "market_cap_usd", volume: "volume_24h_usd", holders: "holders" } as const;

export function coinPage(p: { sort: keyof typeof SORT_COLUMNS; graduated: boolean; q: string; offset: number; limit: number }) {
  const db = sql();
  const order = db.unsafe(`${SORT_COLUMNS[p.sort]} desc nulls last, launched_at desc`);
  const q = p.q.trim();
  const search =
    q.length >= 32
      ? db`and (mint = ${q} or pq_address = ${q} or creator = ${q})`
      : q
        ? db`and (name ilike ${"%" + q.replace(/[%_\\]/g, "\\$&") + "%"} or symbol ilike ${"%" + q.replace(/[%_\\]/g, "\\$&") + "%"})`
        : db``;
  return db<CoinRow[]>`
    select * from coins
    where true ${p.graduated ? db`and complete` : db``} ${search}
    order by ${order}
    limit ${p.limit} offset ${p.offset}`;
}

export type CoinDetailRow = CoinRow & { digest: string; signature: string; leaf_purpose: string | null; leaf_ref: string | null; leaf_digest: string | null };

/** A visible coin, its attestation, and the registry's record of the one-time key it used. */
export async function coinByMint(mint: string): Promise<CoinDetailRow | null> {
  const [row] = await sql()<CoinDetailRow[]>`
    select c.*, l.digest, l.signature, u.purpose as leaf_purpose, u.ref as leaf_ref, u.digest as leaf_digest
    from coins c join launches l using (mint)
    left join leaf_uses u on u.identity_id = l.identity_id and u.leaf = l.leaf
    where c.mint = ${mint}`;
  return row ?? null;
}

export async function counts(): Promise<{ identities: number; launches: number; keysSpent: number; anchored: number }> {
  const [row] = await sql()<{ identities: number; launches: number; keys_spent: number; anchored: number }[]>`
    select (select count(*) from identities)::int as identities,
           (select count(*) from launches where status = 'live' and not hidden)::int as launches,
           (select count(*) from leaf_uses)::int as keys_spent,
           (select count(*) from identities where anchor_tx is not null)::int as anchored`;
  return { identities: row.identities, launches: row.launches, keysSpent: row.keys_spent, anchored: row.anchored };
}

export type MarketRow = {
  mint: string;
  price_usd: number | null;
  market_cap_usd: number | null;
  volume_24h_usd: number;
  holders?: number;
  curve_progress: number | null;
  complete: boolean;
};

export async function upsertMarket(rows: MarketRow[]) {
  for (const r of rows) {
    await sql()`
      insert into launch_market (mint, price_usd, market_cap_usd, volume_24h_usd, holders, curve_progress, complete, updated_at)
      values (${r.mint}, ${r.price_usd}, ${r.market_cap_usd}, ${r.volume_24h_usd}, ${r.holders ?? null}, ${r.curve_progress}, ${r.complete}, now())
      on conflict (mint) do update set
        price_usd = excluded.price_usd, market_cap_usd = excluded.market_cap_usd, volume_24h_usd = excluded.volume_24h_usd,
        holders = coalesce(excluded.holders, launch_market.holders), curve_progress = excluded.curve_progress,
        complete = excluded.complete, updated_at = now()`;
  }
}

// ── proofs ───────────────────────────────────────────────────────────────────

export type ProofRow = { id: string; pq_address: string; leaf: number; challenge: string; note: string; digest: string; signature: string; created_at: string };

export async function insertProof(r: Omit<ProofRow, "created_at"> & { identity_id: number }) {
  await sql()`insert into proofs ${sql()(r)}`;
}

export async function proofById(id: string): Promise<ProofRow | null> {
  const [row] = await sql()<ProofRow[]>`select id, pq_address, leaf, challenge, note, digest, signature, created_at from proofs where id = ${id}`;
  return row ?? null;
}

// ── uploads (every pinned image, so unused ones get unpinned) ───────────────

export type UploadRow = { cid: string; pin_id: string; url: string; sha256: string; dhash: string | null; ip_hash: string; created_at: string; used_at: string | null };

export async function uploadBySha(sha256: string): Promise<UploadRow | null> {
  const [row] = await sql()<UploadRow[]>`select * from uploads where sha256 = ${sha256}`;
  return row ?? null;
}

export async function uploadByUrl(url: string): Promise<UploadRow | null> {
  const [row] = await sql()<UploadRow[]>`select * from uploads where url = ${url}`;
  return row ?? null;
}

export async function insertUpload(r: Omit<UploadRow, "created_at" | "used_at">) {
  await sql()`insert into uploads ${sql()(r)} on conflict do nothing`;
}

/** Uploads in the last 24 h, from this client and overall. */
export async function uploadCounts(ipHash: string): Promise<{ mine: number; all: number }> {
  const [row] = await sql()<{ mine: number; all: number }[]>`
    select count(*) filter (where ip_hash = ${ipHash})::int as mine, count(*)::int as all
    from uploads where created_at > now() - interval '24 hours'`;
  return row;
}

/** Images moderation has removed: their exact hash and perceptual hash. */
export async function blockedImages(): Promise<{ sha256: string; dhash: string | null }[]> {
  return sql()<{ sha256: string; dhash: string | null }[]>`select sha256, dhash from blocked_images`;
}

export async function markUploadUsed(url: string) {
  await sql()`update uploads set used_at = coalesce(used_at, now()) where url = ${url}`;
}

/** Images nobody launched with: pinned before `before`, never used. */
export function unusedUploadsBefore(before: string) {
  return sql()<UploadRow[]>`select * from uploads where used_at is null and created_at < ${before} order by created_at limit 200`;
}

export async function deleteUpload(cid: string) {
  await sql()`delete from uploads where cid = ${cid}`;
}

// ── reports ──────────────────────────────────────────────────────────────────

export async function insertReport(r: { mint: string; reason: string; details: string; ip_hash: string }) {
  await sql()`insert into reports ${sql()(r)} on conflict do nothing`;
}

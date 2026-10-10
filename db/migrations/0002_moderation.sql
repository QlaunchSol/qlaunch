-- Uploads, reports and takedowns.

-- Every pinned image, so unused ones can be unpinned (no free image hosting)
-- and repeats deduplicated. ip_hash is a salted hash, never the address.
create table if not exists uploads (
  cid text primary key,
  pin_id text not null,
  url text not null unique,
  sha256 text not null unique,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists uploads_unused on uploads (created_at) where used_at is null;
create index if not exists uploads_by_ip_day on uploads (ip_hash, created_at);

-- The metadata pin of each launch, so a takedown or an abandoned launch can unpin it.
alter table launches add column if not exists metadata_pin_id text;

-- Reports from visitors about a coin.
create table if not exists reports (
  id bigint generated always as identity primary key,
  mint text not null references launches (mint) on delete cascade,
  reason text not null check (reason in ('illegal', 'sexual', 'violence', 'scam', 'impersonation', 'other')),
  details text not null default '',
  ip_hash text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text
);
create index if not exists reports_open on reports (mint) where resolved_at is null;
create unique index if not exists reports_one_per_ip on reports (mint, ip_hash) where resolved_at is null;

-- On-chain verification of launches: the dev buy as it actually landed, and why a launch failed.
alter table launches add column if not exists dev_tokens numeric(30, 6);
alter table launches add column if not exists failure_reason text;

-- Coins expose the dev buy as it landed on chain (appended: replacing a view keeps column order).
create or replace view coins as
select l.mint, l.name, l.symbol, l.description, l.image_url, l.metadata_uri, l.twitter, l.telegram,
       l.creator, l.pq_address, l.leaf, l.dev_buy_sol, l.tx_signature, l.created_at, l.launched_at,
       m.price_usd, m.market_cap_usd, m.volume_24h_usd, m.holders, m.curve_progress,
       coalesce(m.complete, false) as complete, m.updated_at as market_updated_at,
       l.dev_tokens
from launches l
left join launch_market m on m.mint = l.mint
where l.status = 'live' and not l.hidden;

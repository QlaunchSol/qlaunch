-- Schema for the post-quantum launchpad. Apply in the Supabase SQL editor or with
--   psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
-- Every table has RLS on. The browser (anon key) can only read; all writes go
-- through the server with the service-role key, which bypasses RLS.

create table if not exists identities (
  id bigint generated always as identity primary key,
  wallet text not null unique,
  pq_address text not null unique,
  root text not null check (root ~ '^[0-9a-f]{64}$'),
  pub_seed text not null check (pub_seed ~ '^[0-9a-f]{64}$'),
  height smallint not null default 8,
  epoch integer not null default 0,
  -- The statement both keys signed, verbatim, so anyone can re-check it later.
  statement text not null,
  wallet_signature text not null,       -- base58 ed25519 signature over the statement
  registration_signature text not null, -- base64 WOTS signature (leaf 0) over its digest
  anchor_tx text,
  anchor_slot bigint,
  anchored_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per spent one-time key. The primary key is what makes a WOTS key
-- one-time: a second use of (identity, leaf) cannot be inserted, whatever races.
create table if not exists leaf_uses (
  identity_id bigint not null references identities (id) on delete cascade,
  leaf smallint not null check (leaf between 0 and 255),
  purpose text not null check (purpose in ('register', 'launch', 'prove')),
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  ref text,
  created_at timestamptz not null default now(),
  primary key (identity_id, leaf)
);

create table if not exists launches (
  mint text primary key,
  identity_id bigint not null references identities (id),
  creator text not null,
  pq_address text not null,
  leaf smallint not null,
  name text not null,
  symbol text not null,
  description text not null default '',
  image_url text not null,
  metadata_uri text not null,
  twitter text not null default '',
  telegram text not null default '',
  website text,
  digest text not null,
  signature text not null,
  dev_buy_sol numeric(20, 9) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'live', 'failed')),
  tx_signature text,
  created_at timestamptz not null default now(),
  launched_at timestamptz,
  unique (identity_id, leaf)
);
create index if not exists launches_new on launches (status, launched_at desc nulls last);
create index if not exists launches_by_identity on launches (identity_id, created_at desc);

-- Market data lives apart from launches so its minute-by-minute refresh never
-- reaches the realtime feed, which only carries new and newly-live coins.
create table if not exists launch_market (
  mint text primary key references launches (mint) on delete cascade,
  price_usd double precision,
  market_cap_usd double precision,
  volume_24h_usd double precision,
  holders integer,
  curve_progress real,
  complete boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists market_mcap on launch_market (market_cap_usd desc nulls last);
create index if not exists market_volume on launch_market (volume_24h_usd desc nulls last);
create index if not exists market_holders on launch_market (holders desc nulls last);

create or replace view coins with (security_invoker = true) as
select l.mint, l.name, l.symbol, l.description, l.image_url, l.metadata_uri, l.twitter, l.telegram,
       l.creator, l.pq_address, l.leaf, l.dev_buy_sol, l.tx_signature, l.created_at, l.launched_at,
       m.price_usd, m.market_cap_usd, m.volume_24h_usd, m.holders, m.curve_progress,
       coalesce(m.complete, false) as complete, m.updated_at as market_updated_at
from launches l
left join launch_market m on m.mint = l.mint
where l.status = 'live';

-- Proofs of possession: a challenge signed with a fresh one-time key, no ed25519 involved.
create table if not exists proofs (
  id text primary key,
  identity_id bigint not null references identities (id) on delete cascade,
  pq_address text not null,
  leaf smallint not null,
  challenge text not null,
  note text not null default '',
  digest text not null,
  signature text not null,
  created_at timestamptz not null default now()
);
create index if not exists proofs_by_identity on proofs (identity_id, created_at desc);

-- Marks a leaf spent. Returns 'ok' on first use, 'same' when this exact digest
-- already spent it (a retry of the same request), 'used' otherwise.
create or replace function burn_leaf(p_identity bigint, p_leaf smallint, p_purpose text, p_digest text, p_ref text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing leaf_uses;
begin
  insert into leaf_uses (identity_id, leaf, purpose, digest, ref)
  values (p_identity, p_leaf, p_purpose, p_digest, p_ref)
  on conflict do nothing;
  if found then
    return 'ok';
  end if;
  select * into existing from leaf_uses where identity_id = p_identity and leaf = p_leaf;
  if existing.digest = p_digest and existing.purpose = p_purpose then
    return 'same';
  end if;
  return 'used';
end;
$$;
revoke all on function burn_leaf(bigint, smallint, text, text, text) from public, anon, authenticated;

alter table identities enable row level security;
alter table leaf_uses enable row level security;
alter table launches enable row level security;
alter table proofs enable row level security;
alter table launch_market enable row level security;

-- Everything published here is public by design (roots, signatures, statements).
drop policy if exists "public read" on identities;
create policy "public read" on identities for select using (true);
drop policy if exists "public read" on leaf_uses;
create policy "public read" on leaf_uses for select using (true);
drop policy if exists "public read live" on launches;
create policy "public read live" on launches for select using (status = 'live');
drop policy if exists "public read" on launch_market;
create policy "public read" on launch_market for select using (true);
drop policy if exists "public read" on proofs;
create policy "public read" on proofs for select using (true);

-- Live coin feed for the browser.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'launches') then
    alter publication supabase_realtime add table launches;
  end if;
end;
$$;

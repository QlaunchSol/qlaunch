-- Spent one-time keys of identities that were reset (a forgotten passphrase).
-- Registering the same identity again (same passphrase) restores them, so a
-- key can never sign twice, reset or not.
create table if not exists retired_leaves (
  pq_address text not null,
  leaf smallint not null check (leaf between 0 and 255),
  purpose text not null,
  digest text not null,
  ref text,
  created_at timestamptz not null,
  retired_at timestamptz not null default now(),
  primary key (pq_address, leaf)
);

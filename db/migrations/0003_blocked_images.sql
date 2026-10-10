-- Images removed by moderation. Uploads of the same picture, byte for byte or
-- a near copy (perceptual hash), are refused, so a taken-down image can't
-- simply be launched again.

-- 64-bit difference hash of each upload (hex), recorded so a takedown can block it.
alter table uploads add column if not exists dhash text;

create table if not exists blocked_images (
  sha256 text primary key,
  dhash text,
  note text not null default '',
  created_at timestamptz not null default now()
);

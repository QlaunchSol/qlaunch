# qlaunch

A pump.fun launchpad where every coin carries a post-quantum attestation: a
hash-based WOTS+ one-time signature by the launcher, over the coin's mint,
name, ticker, image and description, pinned into the coin's metadata.
Anyone can verify it with nothing but SHA-256. The full protocol is at
`/docs` on the running site.

Built and run on one small machine (1 GB RAM, 1 vCPU).

## Layout

```
src/lib/pq/          the protocol: WOTS+, Merkle identities, addresses, messages, key derivation
src/lib/server/      Postgres (db.ts holds every query), Solana/pump.fun, IPFS, market data, live feed, jobs
src/lib/client/      wallet (Wallet Standard), identity context, in-browser coin verification
src/app/api/         identity, launch, prove, token, launches (+ live stream), upload routes
src/components/      UI, including the wallet connect dialog
db/migrations        database schema, applied by scripts/migrate.mts
scripts/             verify.py, e2e test, LiteSVM fork, lookup-table setup, migrate, moderate
deploy/              build.sh, capped.sh, postgres.sh, backup.sh + timer, systemd unit, Caddyfile
```

## Configuration

Copy `.env.example` to `.env.production` and fill it in. `NEXT_PUBLIC_*`
values are inlined at build time: rebuild after changing them. Everything
else is read at runtime: restart after changing it
(`sudo systemctl restart launchpad`).

Everything runs on this machine except three outside services:

| Service | Variables | Why it can't be in-house |
|---|---|---|
| Solana RPC (e.g. Helius) | `HELIUS_RPC_URL` | an RPC node needs hundreds of GB of RAM; free tiers suffice. Helius also enables holder counts |
| Pinata (IPFS) | `PINATA_JWT`, `PINATA_GATEWAY` | coin images and metadata (with the attestation) must outlive this server, and we don't host user uploads |
| A domain | `NEXT_PUBLIC_SITE_URL`, Caddyfile | coin metadata links are written on-chain forever |

Free, keyless data: DexScreener (volume, graduated prices), GeckoTerminal (charts, SOL price fallback), Jupiter (SOL price).
In-house: PostgreSQL (`deploy/postgres.sh`, schema via `scripts/migrate.mts`), the live coin feed (server-sent events), wallet
connections (Wallet Standard: browser extensions, in-wallet browsers, Mobile Wallet Adapter on Android), Redis cache.

Also set `TREASURY_ADDRESS` (receives pump.fun creator fees) and, for dev buys, `LOOKUP_TABLE_ADDRESS`.

### Lookup table

A launch with a dev buy names 26 accounts and doesn't fit Solana's
1,232-byte limit without an address lookup table. Create one per cluster,
once (about 0.006 SOL), then set `LOOKUP_TABLE_ADDRESS`:

```bash
RPC_URL=$HELIUS_RPC_URL TREASURY_ADDRESS=… npx tsx scripts/create-lookup-table.mts --dry-run
RPC_URL=$HELIUS_RPC_URL TREASURY_ADDRESS=… PAYER=payer.json npx tsx scripts/create-lookup-table.mts --freeze
```

## Build and deploy (on this machine)

```bash
deploy/build.sh
```

Builds in a memory-capped systemd unit (550 MB RAM, overflow to swap) so a
build can never take the machine down, writes to `.next-build` (keeping
Turbopack's cache: cold ~5 min, incremental ~30 s), then swaps the result
into `.next-live`, applies pending database migrations and restarts the
`launchpad` service (~2 s of downtime).
Run other heavy commands the same way: `deploy/capped.sh npx tsc --noEmit`.
Never run `next build` directly on a 1 GB machine.

Caddy serves HTTPS (`deploy/Caddyfile` → `/etc/caddy/Caddyfile`). For a real
domain, point its A record here and replace the hostname in the Caddyfile and
`NEXT_PUBLIC_SITE_URL`.

## Tests

```bash
deploy/capped.sh npx vitest run                                   # protocol unit tests
python3 -I scripts/verify.py --vectors scripts/vectors/launch.json   # independent verifier vs. vectors
```

End-to-end, against a running server, with no SOL needed: transactions run
in a LiteSVM fork of the cluster with pump.fun's real program:

```bash
deploy/capped.sh bash -c 'set -a; . ./.env.production; set +a; SEND=fork \
  BASE_URL=http://127.0.0.1:3000 RPC_URL=https://api.mainnet-beta.solana.com \
  WALLET=/path/to/test-wallet.json npx tsx scripts/e2e.mts'
```

Drop `SEND=fork` to send for real on devnet (the wallet needs devnet SOL).

## Operations

- **Backups:** `launchpad-backup.timer` dumps the database nightly to `~/backups` (14 kept). Copy them off the machine now and
  then; restore with `pg_restore -d "$DATABASE_URL" --clean <file>`.
- **Moderation:** `scripts/moderate.mts hide <mint>` removes a coin from this site (it stays on pump.fun); `show` undoes it.
- **Logs:** `journalctl -u launchpad -f`.

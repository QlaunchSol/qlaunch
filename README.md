# Hashmint (placeholder name)

A pump.fun launchpad where every coin carries a post-quantum attestation: a
hash-based WOTS+ one-time signature by the launcher, over the coin's mint,
name, ticker, image and description, pinned into the coin's metadata.
Anyone can verify it with nothing but SHA-256. The full protocol is at
`/docs` on the running site.

Built and run on one small machine (1 GB RAM, 1 vCPU).

## Layout

```
src/lib/pq/          the protocol: WOTS+, Merkle identities, addresses, messages, key derivation
src/lib/server/      Supabase, Solana/pump.fun, storage, market data, rate limits, jobs
src/lib/client/      wallet (Reown AppKit), identity context, in-browser coin verification
src/app/api/         identity, launch, prove, token, launches, upload routes
src/components/      UI
supabase/migrations  database schema (RLS on; writes only through the server)
scripts/             verify.py (independent verifier), e2e test, LiteSVM fork, lookup-table setup
deploy/              build.sh, capped.sh, systemd unit, Caddyfile, local Supabase stand-in
```

## Configuration

Copy `.env.example` to `.env.production` and fill it in. `NEXT_PUBLIC_*`
values are inlined at build time: rebuild after changing them. Everything
else is read at runtime: restart after changing it
(`sudo systemctl restart launchpad`).

| Service | Variables | Needed for |
|---|---|---|
| Helius | `HELIUS_RPC_URL` | reliable RPC (falls back to the rate-limited public RPC) |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything stateful; the anon key powers the live coin feed |
| Pinata | `PINATA_JWT`, `PINATA_GATEWAY` | IPFS for coin images and metadata |
| Reown | `NEXT_PUBLIC_PROJECT_ID` | WalletConnect wallets (browser extensions work without it) |
| Treasury | `TREASURY_ADDRESS` | on-chain creator of every coin: receives pump.fun creator fees |
| Lookup table | `LOOKUP_TABLE_ADDRESS` | launches with a dev buy (see below) |
| Birdeye | `BIRDEYE_API_KEY` | optional: holder counts, chart fallback |

Apply the schema once in the Supabase SQL editor: `supabase/migrations/0001_init.sql`.

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
into `.next-live` and restarts the `launchpad` service (~2 s of downtime).
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

## Staging without accounts

`deploy/local-supabase.sh` stands up Postgres + PostgREST behind the same
URL shape supabase-js expects, and `LOCAL_STORAGE_DIR` stores uploads on this
server instead of IPFS. Both are for testing; production uses Supabase and
Pinata.

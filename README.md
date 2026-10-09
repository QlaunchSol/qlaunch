# Qlaunch

**Launch coins that outlive the curve.** [qlaunch.xyz](https://qlaunch.xyz) · [How it works](https://qlaunch.xyz/docs) · [@QlaunchSol](https://x.com/QlaunchSol)

A pump.fun launchpad where every coin carries a post-quantum attestation: a hash-based one-time signature by its
launcher, over the coin's mint, name, ticker, image and description, pinned into the coin's own IPFS metadata.

Solana addresses *are* ed25519 public keys. When a quantum computer (or a classical break) defeats the curve, any
wallet signature can be forged, and with it any claim about who launched what. Hash-based signatures rest on
SHA-256 alone, which Grover's algorithm only weakens from 256 to ~128 bits. Qlaunch gives each creator a
hash-based identity now, while ed25519 can still vouch for it, and signs every launch with it.

## How it works

| Step | What happens |
|---|---|
| **Derive** | Your wallet signs a fixed message; that deterministic signature (plus an optional scrypt-stretched passphrase) seeds 256 WOTS+ one-time keys, generated in your browser. Nothing secret leaves the tab. |
| **Register** | The keys form a Merkle tree; its root is your post-quantum public key, its hash your `pq1…` address. Your wallet and one-time key #0 sign the same statement, binding the two both ways. |
| **Anchor** | An SPL memo timestamps the root on Solana while ed25519 is still trustworthy. |
| **Launch** | A fresh one-time key signs the coin. It's created on pump.fun's bonding curve in one transaction, the attestation inside its metadata. |
| **Verify** | Anyone rebuilds the digest from public fields, walks 67 hash chains and 8 tree levels, and compares with the root. The coin page does it in your browser. |

Parameters: WOTS+ with w = 16 over a tweakable SHA-256 (67 chains), Merkle tree of height 8, 2,404-byte signatures,
64-byte public keys. The protocol is specified at [qlaunch.xyz/docs](https://qlaunch.xyz/docs) and implemented in
[`src/lib/pq`](src/lib/pq).

## Verify a coin yourself

[`scripts/verify.py`](scripts/verify.py) is an independent verifier, written apart from the TypeScript and using only
Python's standard library:

```bash
curl -O https://qlaunch.xyz/verify.py
python3 verify.py https://qlaunch.xyz/coin/<mint>
```

Both implementations are checked against the same test vectors (`scripts/vectors/`).

## What it protects, and what it doesn't

- **Protects:** proof of who launched a coin, after a curve break; identity ownership via a challenge-response that
  never touches ed25519; one-time key reuse, which the database refuses.
- **Doesn't protect:** funds. SOL and tokens in ordinary Solana accounts are guarded by ed25519 alone.
- **Creator fees:** every coin's on-chain creator is the Qlaunch treasury, so pump.fun creator fees go to it, not to
  the launcher. The launch form says so before you sign.

---

The rest of this file is for running it.

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

## License

MIT. See [LICENSE](LICENSE).

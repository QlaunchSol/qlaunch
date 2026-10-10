/** API shapes shared by server routes and client components. */

export type IdentityJson = {
  address: string;
  wallet: string;
  root: string;
  pubSeed: string;
  height: number;
  epoch: number;
  statement: string;
  walletSignature: string;
  registrationSignature: string;
  anchor: { tx: string; slot: number | null; at: string | null } | null;
  createdAt: string;
};

export type UsedLeaf = { leaf: number; purpose: string; ref: string | null; digest: string; created_at: string };

export type IdentityLaunch = { mint: string; name: string; symbol: string; image_url: string; leaf: number; status: string; created_at: string; launched_at: string | null };

export type IdentityDetail = { identity: IdentityJson; usedLeaves: UsedLeaf[]; launches: IdentityLaunch[] };

export type Coin = {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  metadataUri: string;
  twitter: string;
  telegram: string;
  creator: string;
  pqAddress: string;
  leaf: number;
  /** The launch digest its one-time key signed (hex). */
  digest: string;
  /** The project's own coin (site.officialCoin). */
  official: boolean;
  /** Tokens the launcher bought in the creation transaction, as read from chain. */
  devTokens: number | null;
  txSignature: string | null;
  launchedAt: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  holders: number | null;
  progress: number | null;
  complete: boolean;
};

export type CoinList = { coins: Coin[]; hasMore: boolean };

export type TokenDetail = {
  coin: Coin | null;
  attestation: { digest: string; signature: string } | null;
  /** The registry's record of the one-time key this coin used. */
  keyUse: { purpose: string | null; ref: string | null; digest: string | null } | null;
  identity: IdentityJson | null;
};

export type Proof = { id: string; pq_address: string; leaf: number; challenge: string; note: string; digest: string; signature: string; created_at: string };

export type PlatformStats = { identities: number; launches: number; keysSpent: number; anchored: number };

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

import "server-only";

/**
 * Server configuration. Required values throw a clear error the first time a
 * feature needs them, instead of failing deep inside a library.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new ConfigError(`${name} is not set`);
  return v;
}

export class ConfigError extends Error {}

export const env = {
  rpcUrl: () => process.env.HELIUS_RPC_URL || (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com"),
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  pinataJwt: () => required("PINATA_JWT"),
  pinataGateway: () => required("NEXT_PUBLIC_PINATA_GATEWAY").replace(/^https?:\/\//, "").replace(/\/$/, ""),
  treasury: () => required("NEXT_PUBLIC_TREASURY"),
  birdeyeKey: () => process.env.BIRDEYE_API_KEY || "",
  redisUrl: () => process.env.REDIS_URL || "",
  adminPassword: () => process.env.ADMIN_PASSWORD || "",
};

export const configured = {
  db: () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  pinata: () => Boolean(process.env.PINATA_JWT && process.env.NEXT_PUBLIC_PINATA_GATEWAY),
  treasury: () => Boolean(process.env.NEXT_PUBLIC_TREASURY),
  helius: () => Boolean(process.env.HELIUS_RPC_URL),
};

import "server-only";
import { cached } from "./cache";
import { launchByMint } from "./db";

export type OfficialCoin = { mint: string; symbol: string | null };

/**
 * The project's own coin, from OFFICIAL_MINT (read at runtime: set it in
 * .env.production and restart, no rebuild). Its ticker comes from our launch
 * record when it was launched here, else OFFICIAL_SYMBOL.
 */
export async function officialCoin(): Promise<OfficialCoin | null> {
  const mint = process.env.OFFICIAL_MINT?.trim();
  if (!mint) return null;
  const symbol = await cached(`official:symbol:${mint}`, 5 * 60_000, async () => (await launchByMint(mint).catch(() => null))?.symbol ?? "").catch(() => "");
  return { mint, symbol: symbol || process.env.OFFICIAL_SYMBOL?.trim() || null };
}

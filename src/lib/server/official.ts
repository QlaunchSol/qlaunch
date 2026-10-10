import "server-only";
import { site } from "@/config/site";

export type OfficialCoin = { mint: string; symbol: string };

/** The project's own coin (site.officialCoin in src/config/site.ts), or null when no mint is set. */
export async function officialCoin(): Promise<OfficialCoin | null> {
  return site.officialCoin.mint ? site.officialCoin : null;
}

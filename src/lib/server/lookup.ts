import "server-only";
import { PublicKey, type AddressLookupTableAccount } from "@solana/web3.js";
import { connection } from "./solana";

/**
 * The address lookup table for launch transactions (LOOKUP_TABLE_ADDRESS).
 * create_v2 plus a first buy names 26 accounts and doesn't fit Solana's
 * 1,232-byte limit with full addresses; the table turns pump.fun's static
 * accounts into one-byte indexes. Create one with scripts/create-lookup-table.mts.
 */
let cache: { at: number; table: AddressLookupTableAccount | null } | null = null;

export async function launchLookupTable(): Promise<AddressLookupTableAccount | null> {
  const key = process.env.LOOKUP_TABLE_ADDRESS;
  if (!key) return null;
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.table;
  const table = (await connection().getAddressLookupTable(new PublicKey(key))).value;
  if (!table) console.error(`lookup table ${key} not found on this cluster`);
  cache = { at: Date.now(), table };
  return table;
}

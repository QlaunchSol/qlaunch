import "server-only";
import { PublicKey } from "@solana/web3.js";
import { FieldError, cleanText } from "@/lib/fields";
import { bad } from "./http";

export function isPubkey(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) return false;
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

export function pubkey(value: unknown, what = "address"): string {
  return isPubkey(value) ? value : bad(`Invalid ${what}`);
}

/** Runs a shared field cleaner, turning its FieldError into a 400. */
export function field<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof FieldError) return bad(err.message);
    throw err;
  }
}

export const text = (value: unknown, max: number, what: string, opts?: { required?: boolean; multiline?: boolean }) =>
  field(() => cleanText(value, max, what, opts));

export function integer(value: unknown, min: number, max: number, what: string): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) return bad(`Invalid ${what}`);
  return n;
}

import "server-only";
import { site } from "@/config/site";
import { cleanLaunchForm, type LaunchForm } from "@/lib/fields";
import type { LaunchFields } from "@/lib/pq";
import { identityByWallet, uploadByUrl, type IdentityRow } from "./db";
import { bad } from "./http";
import { MAX_DEV_BUY_SOL } from "./launch";
import { isGatewayUrl } from "./pinata";
import { field, integer, pubkey } from "./validate";

export type LaunchRequest = { wallet: string; mint: string; form: LaunchForm; devBuySol: number; identity: IdentityRow };

/** Validates everything a launch request carries except its signature. Shared by preflight and prepare. */
export async function parseLaunchRequest(body: Record<string, unknown>): Promise<LaunchRequest> {
  const wallet = pubkey(body.wallet, "wallet");
  const mint = pubkey(body.mint, "mint");
  const form = field(() => cleanLaunchForm(body, { allowReserved: Boolean(site.officialWallet) && wallet === site.officialWallet }));
  if (!isGatewayUrl(form.image) || !(await uploadByUrl(form.image))) bad("Upload the image again: it has expired or wasn't uploaded here.");
  const devBuySol = Number(body.devBuySol ?? 0);
  if (!Number.isFinite(devBuySol) || devBuySol < 0 || devBuySol > MAX_DEV_BUY_SOL) bad(`Dev buy must be between 0 and ${MAX_DEV_BUY_SOL} SOL`);
  const identity = (await identityByWallet(wallet)) ?? bad("Register a post-quantum identity first", 403);
  return { wallet, mint, form, devBuySol, identity };
}

export function launchFields(r: LaunchRequest, leaf: number): LaunchFields {
  return { mint: r.mint, creator: r.wallet, pqAddress: r.identity.pq_address, leaf, ...r.form };
}

export const leafOf = (value: unknown) => integer(value, 1, 255, "one-time key");

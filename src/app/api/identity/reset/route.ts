import { ed25519 } from "@noble/curves/ed25519.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { resetStatement } from "@/lib/identity-reset";
import { rateLimit } from "@/lib/server/cache";
import { failLaunch, identityByWallet, launchByMint, launchesOfIdentity, resetIdentity } from "@/lib/server/db";
import { bad, clientIp, readJson, route } from "@/lib/server/http";
import { confirmLaunch, curveExists } from "@/lib/server/launch";
import { unpin } from "@/lib/server/pinata";
import { pubkey } from "@/lib/server/validate";

// A signed launch transaction expires ~1–2 minutes after signing (its blockhash); allow plenty more.
const IN_FLIGHT_MS = 5 * 60_000;

/**
 * POST {wallet, signature}: deletes the wallet's identity so it can register
 * a new one (the passphrase is lost and the keys with it). The wallet signs
 * resetStatement. Refused once the identity has a coin, so no attestation is
 * ever orphaned; a launch that never reached the chain doesn't count.
 */
export const POST = route(async (request) => {
  await rateLimit(`reset:${clientIp(request)}`, 5, 3600, { failClosed: true });
  const body = await readJson(request);
  const wallet = pubkey(body.wallet, "wallet");
  const identity = (await identityByWallet(wallet)) ?? bad("This wallet has no identity", 404);

  const statement = resetStatement({ wallet, pqAddress: identity.pq_address, registeredAt: identity.created_at });
  let ok = false;
  try {
    const sig = bs58.decode(String(body.signature));
    ok = sig.length === 64 && ed25519.verify(sig, utf8ToBytes(statement), new PublicKey(wallet).toBytes());
  } catch {}
  if (!ok) bad("Wallet signature doesn't verify");

  for (const l of await launchesOfIdentity(identity.id)) {
    if (l.status === "failed") continue;
    if (l.status === "pending") {
      const launch = (await launchByMint(l.mint))!;
      if ((await curveExists(l.mint)) && (await confirmLaunch(launch)) !== "failed") bad("This identity has launched a coin, so it can't be reset.", 409, "has_coins");
      if (Date.now() - new Date(l.created_at).getTime() < IN_FLIGHT_MS) bad("A launch from this identity may still be landing. Try again in a few minutes.", 409, "in_flight");
      if (!(await curveExists(l.mint))) await failLaunch(l.mint, "never landed on chain (identity reset)");
      continue;
    }
    bad("This identity has launched a coin, so it can't be reset.", 409, "has_coins");
  }

  const pins = (await resetIdentity(identity)) ?? bad("This identity has launched a coin, so it can't be reset.", 409, "has_coins");
  for (const pin of pins) await unpin(pin).catch(() => {});
  console.log(`identity reset: ${identity.pq_address} (wallet ${wallet})`);
  return Response.json({ ok: true });
});

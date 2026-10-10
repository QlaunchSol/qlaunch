import { PublicKey } from "@solana/web3.js";
import { cached, rateLimit } from "@/lib/server/cache";
import { clientIp, route } from "@/lib/server/http";
import { LAMPORTS_PER_SOL, connection } from "@/lib/server/solana";
import { pubkey } from "@/lib/server/validate";

/** GET /api/wallet/balance?wallet=… → {sol} */
export const GET = route(async (request) => {
  await rateLimit(`balance:${clientIp(request)}`, 20, 60);
  const wallet = pubkey(new URL(request.url).searchParams.get("wallet"), "wallet");
  const lamports = await cached(`balance:${wallet}`, 5_000, () => connection().getBalance(new PublicKey(wallet)));
  return Response.json({ sol: lamports / LAMPORTS_PER_SOL }, { headers: { "Cache-Control": "no-store" } });
});

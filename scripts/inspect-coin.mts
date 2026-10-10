// Prints what chain says about a pump.fun coin: curve creator, Token-2022 metadata, creation tx.
//   RPC_URL=… npx tsx scripts/inspect-coin.mts <mint>
import { createRequire } from "node:module";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getTokenMetadata } from "@solana/spl-token";
const pump = createRequire(import.meta.url)("@pump-fun/pump-sdk");
const conn = new Connection(process.env.RPC_URL!, "confirmed");
const mint = new PublicKey(process.argv[2]);
const info = await conn.getAccountInfo(mint);
console.log("mint owner:", info?.owner.toBase58());
const meta = await getTokenMetadata(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID).catch((e) => `error: ${e.message}`);
console.log("token metadata:", typeof meta === "string" ? meta : { name: meta?.name, symbol: meta?.symbol, uri: meta?.uri, updateAuthority: meta?.updateAuthority?.toBase58() });
const curveInfo = await conn.getAccountInfo(pump.bondingCurvePda(mint));
const curve = pump.PUMP_SDK.decodeBondingCurve(curveInfo);
console.log("curve creator:", curve.creator.toBase58(), "| complete:", curve.complete);
const sigs = await conn.getSignaturesForAddress(mint, { limit: 1000 });
const first = sigs.at(-1)!;
const tx = await conn.getTransaction(first.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
const keys = tx!.transaction.message.getAccountKeys({ accountKeysFromLookups: tx!.meta!.loadedAddresses });
console.log("oldest sig:", first.signature.slice(0, 16), "| fee payer:", keys.get(0)!.toBase58(), "| signers:", tx!.transaction.message.header.numRequiredSignatures);
const pre = tx!.meta!.preTokenBalances ?? [], post = tx!.meta!.postTokenBalances ?? [];
for (const b of post) if (b.mint === mint.toBase58()) console.log("post token balance:", b.owner, b.uiTokenAmount.uiAmountString);
console.log("logs mention create:", tx!.meta!.logMessages!.filter((l) => /Instruction: (Create|Buy)/.test(l)).join(" | "));
process.exit(0);

/**
 * Creates the address lookup table that lets a launch with a dev buy fit in
 * one transaction, and prints the LOOKUP_TABLE_ADDRESS to configure.
 *
 *   RPC_URL=… TREASURY_ADDRESS=… npx tsx scripts/create-lookup-table.mts --dry-run
 *   RPC_URL=… TREASURY_ADDRESS=… PAYER=~/payer.json npx tsx scripts/create-lookup-table.mts [--freeze]
 *
 * The table holds the accounts every SOL launch shares: pump.fun's global
 * state, fee config and recipients, event authority, the treasury's creator
 * vault, system and token programs. They're found by building sample launches
 * for random mints and wallets and keeping what they all have in common, so
 * the list follows the SDK instead of being hard-coded. --freeze makes the
 * table permanent and immutable (recommended once it works). Costs about
 * 0.006 SOL in rent plus fees.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

const pump = createRequire(import.meta.url)("@pump-fun/pump-sdk");
const RPC = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const TREASURY = new PublicKey(process.env.TREASURY_ADDRESS ?? "");
const DRY = process.argv.includes("--dry-run");
const FREEZE = process.argv.includes("--freeze");
const conn = new Connection(RPC, "confirmed");

async function sampleLaunch(): Promise<{ ixs: TransactionInstruction[]; user: PublicKey }> {
  const online = new pump.OnlinePumpSdk(conn);
  const [global, feeConfig] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig().catch(() => null)]);
  const mint = Keypair.generate().publicKey;
  const user = Keypair.generate().publicKey;
  const solAmount = new BN(10_000_000);
  const amount = pump.getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: solAmount, quoteMint: NATIVE_MINT });
  const ixs: TransactionInstruction[] = await pump.PUMP_SDK.createV2AndBuyInstructions({
    global,
    mint,
    name: "x".repeat(32),
    symbol: "X".repeat(10),
    uri: "https://example.com/" + "a".repeat(80),
    creator: TREASURY,
    user,
    amount,
    solAmount,
    mayhemMode: false,
  });
  return { ixs, user };
}

async function staticAccounts(): Promise<PublicKey[]> {
  const samples = (await Promise.all([sampleLaunch(), sampleLaunch(), sampleLaunch()])).map((s) => s.ixs);
  const keysOf = (ixs: TransactionInstruction[]) => new Set(ixs.flatMap((ix) => ix.keys.filter((k) => !k.isSigner).map((k) => k.pubkey.toBase58())));
  const invoked = new Set(samples.flat().map((ix) => ix.programId.toBase58()));
  // Keys every sample shares, minus anything invoked as a program (those must stay static).
  const common = [...keysOf(samples[0])].filter((k) => samples.every((s) => keysOf(s).has(k)) && !invoked.has(k));
  // Buys pick a fee recipient at random: include them all.
  const global = await new pump.OnlinePumpSdk(conn).fetchGlobal();
  const recipients = [global.feeRecipient, ...global.feeRecipients].map((k: PublicKey) => k.toBase58()).filter((k: string) => k !== PublicKey.default.toBase58());
  return [...new Set([...common, ...recipients])].map((k) => new PublicKey(k));
}

/** Size of a worst-case launch (longest name and ticker) compiled against a table holding `addresses`. */
async function worstCaseSize(addresses: PublicKey[]): Promise<number | string> {
  const { ixs, user: payer } = await sampleLaunch();
  const table = new AddressLookupTableAccount({
    key: Keypair.generate().publicKey,
    state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses },
  });
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: "11111111111111111111111111111111",
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }), ...ixs],
  }).compileToV0Message([table]);
  try {
    return new VersionedTransaction(message).serialize().length;
  } catch (e) {
    return `over the limit (${(e as Error).message})`;
  }
}

async function send(payer: Keypair, ixs: TransactionInstruction[]) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
  tx.sign([payer]);
  const sig = await conn.sendTransaction(tx);
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

const addresses = await staticAccounts();
console.log(`${addresses.length} static accounts:`);
for (const a of addresses) console.log(`  ${a.toBase58()}`);
console.log(`worst-case launch with this table: ${await worstCaseSize(addresses)} bytes (limit 1232)`);
if (DRY) process.exit(0);

const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.PAYER!, "utf8"))));
const slot = await conn.getSlot("finalized");
const [create, table] = AddressLookupTableProgram.createLookupTable({ authority: payer.publicKey, payer: payer.publicKey, recentSlot: slot });
console.log(`creating ${table.toBase58()}: ${await send(payer, [create])}`);
for (let i = 0; i < addresses.length; i += 20) {
  const extend = AddressLookupTableProgram.extendLookupTable({ lookupTable: table, authority: payer.publicKey, payer: payer.publicKey, addresses: addresses.slice(i, i + 20) });
  console.log(`extended (${i + Math.min(20, addresses.length - i)}/${addresses.length}): ${await send(payer, [extend])}`);
}
if (FREEZE) console.log(`frozen: ${await send(payer, [AddressLookupTableProgram.freezeLookupTable({ lookupTable: table, authority: payer.publicKey })])}`);
console.log(`\nLOOKUP_TABLE_ADDRESS=${table.toBase58()}`);
process.exit(0); // web3.js leaves a confirmation websocket open

import type { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Checks the launch transaction the server built BEFORE the wallet signs it,
 * so not even a compromised server can slip in a different name, ticker or
 * metadata, a bigger buy, a large priority fee, or an extra instruction. It
 * must contain only: compute-budget settings, pump.fun's create_v2 with exactly
 * the signed details and the launcher as creator (so creator fees are theirs),
 * the launcher's token account, and (with a dev buy) one pump.fun buy capped
 * at the amount the user chose.
 */
const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const ATA = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const CREATE_V2 = [214, 144, 76, 236, 95, 139, 49, 180];
const BUY = [102, 6, 61, 18, 1, 218, 235, 234];
const MAX_PRIORITY_LAMPORTS = 10_000_000; // 0.01 SOL

const startsWith = (data: Uint8Array, tag: number[]) => tag.every((b, i) => data[i] === b);

function reader(data: Uint8Array, offset: number) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let at = offset;
  return {
    string() {
      const len = view.getUint32(at, true);
      const s = new TextDecoder().decode(data.subarray(at + 4, at + 4 + len));
      at += 4 + len;
      return s;
    },
    u64() {
      const v = view.getBigUint64(at, true);
      at += 8;
      return v;
    },
    bytes(n: number) {
      const b = data.subarray(at, at + n);
      at += n;
      return b;
    },
    rest() {
      return data.subarray(at);
    },
    u32() {
      const v = view.getUint32(at, true);
      at += 4;
      return v;
    },
  };
}

export type ExpectedLaunch = { wallet: string; mint: string; name: string; symbol: string; uri: string; devBuySol: number };

export function inspectLaunchTx(tx: VersionedTransaction, e: ExpectedLaunch): void {
  const fail = (why: string): never => {
    throw new Error(`Refusing to sign: the server's transaction ${why}. Nothing was signed.`);
  };
  const msg = tx.message;
  const keys = msg.staticAccountKeys.map((k) => k.toBase58());
  if (keys[0] !== e.wallet) fail("is paid for by someone else");
  const signers = keys.slice(0, msg.header.numRequiredSignatures);
  if (signers.length !== 2 || !signers.includes(e.wallet) || !signers.includes(e.mint)) fail("asks for unexpected signatures");

  let creates = 0;
  let buys = 0;
  let unitPrice = BigInt(0);
  let unitLimit = BigInt(200_000);
  for (const ix of msg.compiledInstructions) {
    const program = keys[ix.programIdIndex];
    const data = ix.data;
    if (program === COMPUTE_BUDGET) {
      if (data[0] === 2) unitLimit = BigInt(reader(data, 1).u32());
      else if (data[0] === 3) unitPrice = reader(data, 1).u64();
      else fail("contains an unexpected compute-budget instruction");
    } else if (program === ATA) {
      // the launcher's token account for the new coin: no value moves
    } else if (program === PUMP && startsWith(data, CREATE_V2)) {
      creates++;
      const r = reader(data, 8);
      const [name, symbol, uri] = [r.string(), r.string(), r.string()];
      if (name !== e.name || symbol !== e.symbol) fail(`would name the coin “${name}” ($${symbol}) instead of what you signed`);
      if (uri !== e.uri) fail("points the coin at different metadata");
      if (bs58.encode(r.bytes(32)) !== e.wallet) fail("would send the coin's creator fees to someone else");
      // mayhem mode, cashback, a custom creator fee rate, holder rewards (which would also take the fees): all off
      if (r.rest().some((b) => b !== 0)) fail("turns on unexpected coin options");
      if (!ix.accountKeyIndexes.some((i) => keys[i] === e.mint)) fail("creates a different coin");
    } else if (program === PUMP && startsWith(data, BUY)) {
      buys++;
      const r = reader(data, 8);
      r.u64(); // token amount
      const maxCost = r.u64();
      const allowed = BigInt(Math.round(e.devBuySol * 1e9 * 1.02)) + BigInt(10_000);
      if (e.devBuySol <= 0 || maxCost > allowed) fail(`would spend up to ${Number(maxCost) / 1e9} SOL on the dev buy`);
    } else {
      fail(`contains an instruction for an unexpected program (${program})`);
    }
  }
  if (creates !== 1) fail("doesn't create exactly one coin");
  if (buys > (e.devBuySol > 0 ? 1 : 0)) fail("contains an unexpected buy");
  if ((unitPrice * unitLimit) / BigInt(1_000_000) > BigInt(MAX_PRIORITY_LAMPORTS)) fail("sets an excessive priority fee");
}

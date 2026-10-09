/**
 * Executes a signed transaction against a local fork of a Solana cluster, in
 * LiteSVM: every account the transaction references (including those behind
 * address lookup tables, and programs with their real deployed bytecode) is
 * copied from the cluster, signers are funded with fake SOL, and the
 * transaction runs in-process. Proves a transaction would land, without
 * spending anything.
 */
import { address, getTransactionDecoder, lamports } from "@solana/kit";
import { Connection, PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";

const UPGRADEABLE = "BPFLoaderUpgradeab1e11111111111111111111111";
const LOADERS = new Set(["BPFLoader2111111111111111111111111111111111", "BPFLoader1111111111111111111111111111111111"]);

export type ForkResult = { ok: boolean; error: string | null; logs: string[]; computeUnits: bigint | null; account: (pk: PublicKey) => Uint8Array | null; owner: (pk: PublicKey) => string | null };

export async function executeOnFork(rpcUrl: string, tx: VersionedTransaction, fund: PublicKey[]): Promise<ForkResult> {
  const conn = new Connection(rpcUrl, "confirmed");
  const svm = new LiteSVM().withBlockhashCheck(false).withSigverify(true);

  // Static keys, the lookup tables themselves, and every address they resolve to.
  const keys: PublicKey[] = [...tx.message.staticAccountKeys];
  for (const lookup of tx.message.addressTableLookups) {
    keys.push(lookup.accountKey);
    const table = (await conn.getAddressLookupTable(lookup.accountKey)).value;
    if (!table) throw new Error(`lookup table ${lookup.accountKey.toBase58()} not found`);
    for (const i of [...lookup.writableIndexes, ...lookup.readonlyIndexes]) keys.push(table.state.addresses[i]);
  }
  const unique = [...new Map(keys.map((k) => [k.toBase58(), k])).values()];
  const infos: Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>> = [];
  for (let i = 0; i < unique.length; i += 100) infos.push(...(await conn.getMultipleAccountsInfo(unique.slice(i, i + 100))));

  for (let i = 0; i < unique.length; i++) {
    const info = infos[i];
    if (!info) continue;
    const id = address(unique[i].toBase58());
    const owner = info.owner.toBase58();
    if (info.executable) {
      if (owner === UPGRADEABLE) {
        const pd = await conn.getAccountInfo(new PublicKey(info.data.subarray(4, 36)));
        if (pd) svm.addProgram(id, pd.data.subarray(45));
      } else if (LOADERS.has(owner)) {
        // Older loaders: deploy with the same loader, or the program misbehaves.
        svm.addProgramWithLoader(id, info.data, address(owner));
      }
      continue; // native programs are built in
    }
    svm.setAccount({ address: id, data: info.data, executable: false, lamports: lamports(BigInt(info.lamports)), programAddress: address(owner), space: BigInt(info.data.length) });
  }
  // Lookup tables are checked against the slot they were last extended in.
  svm.warpToSlot(BigInt(await conn.getSlot()));
  for (const pk of fund) svm.airdrop(address(pk.toBase58()), lamports(10_000_000_000n));

  const result = svm.sendTransaction(getTransactionDecoder().decode(tx.serialize()));
  const failed = result instanceof FailedTransactionMetadata;
  const meta = failed ? result.meta() : result;
  const get = (pk: PublicKey) => svm.getAccount(address(pk.toBase58()));
  return {
    ok: !failed,
    error: failed ? String(result.err()) : null,
    logs: meta.logs(),
    computeUnits: meta.computeUnitsConsumed(),
    account: (pk) => {
      const a = get(pk);
      return a.exists ? a.data : null;
    },
    owner: (pk) => {
      const a = get(pk);
      return a.exists ? a.programAddress : null;
    },
  };
}

"use client";

import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { site } from "@/config/site";
import { LEAVES, REGISTRATION_LEAF, bytesToHex, registrationDigest, registrationStatement, seedMessage, signatureToBase64 } from "@/lib/pq";
import { fromBase64, toBase64 } from "@/lib/pq/bytes";
import { deriveSeed, generateIdentity, sign, type IdentityKeys } from "@/lib/pq/keys";
import type { IdentityDetail } from "@/lib/types";
import { ApiError, api } from "./api";
import { useWallet } from "./wallet";

export type UnlockProgress = { phase: "sign" | "stretch" | "keys"; progress: number } | null;

type IdentityState = {
  wallet: string | null;
  /** The registered identity for this wallet, null if none, undefined while loading. */
  detail: IdentityDetail | null | undefined;
  /** Secret keys, held only in this tab's memory. */
  keys: IdentityKeys | null;
  unlocking: UnlockProgress;
  usedLeaves: Set<number>;
  remaining: number;
  unlock: (passphrase: string) => Promise<IdentityKeys>;
  lock: () => void;
  register: () => Promise<void>;
  anchor: () => Promise<void>;
  refresh: () => Promise<IdentityDetail | null>;
  nextLeaf: (skip?: number[]) => number | null;
};

const Ctx = createContext<IdentityState | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { address: wallet, signMessage, signTransaction } = useWallet();
  const [detail, setDetail] = useState<IdentityDetail | null | undefined>(undefined);
  const [keys, setKeys] = useState<IdentityKeys | null>(null);
  const [unlocking, setUnlocking] = useState<UnlockProgress>(null);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  const refresh = useCallback(async () => {
    const w = walletRef.current;
    if (!w) {
      setDetail(null);
      return null;
    }
    try {
      const d = await api<IdentityDetail>(`/api/identity?wallet=${w}`);
      if (walletRef.current === w) setDetail(d);
      return d;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        if (walletRef.current === w) setDetail(null);
        return null;
      }
      throw err;
    }
  }, []);

  // A different wallet means different keys: drop everything on change.
  useEffect(() => {
    setKeys(null);
    setDetail(wallet ? undefined : null);
    if (wallet) refresh().catch(() => setDetail(null));
  }, [wallet, refresh]);

  const unlock = useCallback(
    async (passphrase: string) => {
      const w = walletRef.current;
      if (!w) throw new Error("Connect a wallet first");
      setUnlocking({ phase: "sign", progress: 0 });
      try {
        const signature = await signMessage(seedMessage(w));
        setUnlocking({ phase: passphrase ? "stretch" : "keys", progress: 0 });
        const seed = await deriveSeed(signature, w, passphrase, (p) => setUnlocking({ phase: "stretch", progress: p }));
        const k = await generateIdentity(seed, 0, (done, total) => setUnlocking({ phase: "keys", progress: done / total }));
        const registered = detail ?? (await refresh());
        if (registered && registered.identity.root !== bytesToHex(k.root)) {
          throw new Error(
            passphrase
              ? "These keys don't match your registered identity. Check the passphrase."
              : "These keys don't match your registered identity. Did you register with a passphrase?",
          );
        }
        if (walletRef.current !== w) throw new Error("The wallet changed while unlocking");
        setKeys(k);
        return k;
      } finally {
        setUnlocking(null);
      }
    },
    [signMessage, detail, refresh],
  );

  const register = useCallback(async () => {
    const w = walletRef.current;
    if (!w || !keys) throw new Error("Unlock your keys first");
    const root = bytesToHex(keys.root);
    const pubSeed = bytesToHex(keys.pubSeed);
    const statement = registrationStatement({ site: site.name, wallet: w, pqAddress: keys.address, root, pubSeed, epoch: keys.epoch });
    const walletSignature = bs58.encode(await signMessage(statement));
    const signature = signatureToBase64(sign(keys, REGISTRATION_LEAF, registrationDigest(statement)));
    const d = await api<IdentityDetail>("/api/identity/register", { body: { wallet: w, root, pubSeed, statement, walletSignature, signature } });
    setDetail(d);
  }, [keys, signMessage]);

  const anchor = useCallback(async () => {
    const w = walletRef.current;
    if (!w) throw new Error("Connect a wallet first");
    const { transaction } = await api<{ transaction: string }>("/api/identity/anchor", { body: { wallet: w } });
    const signed = await signTransaction(VersionedTransaction.deserialize(fromBase64(transaction)));
    const result = await api<IdentityDetail | { pending: true }>("/api/identity/anchor", {
      body: { wallet: w, transaction: toBase64(signed.serialize()) },
    });
    if ("pending" in result) throw new Error("The anchor was sent but hasn't confirmed yet. Check back in a minute.");
    setDetail(result);
  }, [signTransaction]);

  const usedLeaves = useMemo(() => new Set(detail?.usedLeaves.map((u) => u.leaf) ?? []), [detail]);

  const nextLeaf = useCallback(
    (skip: number[] = []) => {
      for (let i = 1; i < LEAVES; i++) if (!usedLeaves.has(i) && !skip.includes(i)) return i;
      return null;
    },
    [usedLeaves],
  );

  const value: IdentityState = {
    wallet,
    detail,
    keys,
    unlocking,
    usedLeaves,
    remaining: detail ? LEAVES - usedLeaves.size : LEAVES - 1,
    unlock,
    lock: () => setKeys(null),
    register,
    anchor,
    refresh,
    nextLeaf,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useIdentity(): IdentityState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useIdentity outside IdentityProvider");
  return ctx;
}

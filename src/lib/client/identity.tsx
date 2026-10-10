"use client";

import { ed25519 } from "@noble/curves/ed25519.js";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LEAVES, REGISTRATION_LEAF, bytesToHex, registrationDigest, registrationStatement, seedMessage, signatureToBase64 } from "@/lib/pq";
import { fromBase64, toBase64 } from "@/lib/pq/bytes";
import { deriveSeed, generateIdentity, sign, type IdentityKeys } from "@/lib/pq/keys";
import { resetStatement } from "@/lib/identity-reset";
import type { IdentityDetail } from "@/lib/types";
import { ApiError, api } from "./api";
import { recordSignature, signedKeys, withKeyLock } from "./leaf-journal";
import { useWallet } from "./wallet";

export type UnlockProgress = { phase: "sign" | "stretch" | "keys"; progress: number } | null;

type IdentityState = {
  wallet: string | null;
  /** The registered identity for this wallet, null if none, undefined while loading or after a lookup error. */
  detail: IdentityDetail | null | undefined;
  lookupError: string | null;
  /** Secret keys, held only in this tab's memory. */
  keys: IdentityKeys | null;
  unlocking: UnlockProgress;
  usedLeaves: Set<number>;
  remaining: number;
  unlock: (passphrase: string) => Promise<IdentityKeys>;
  lock: () => void;
  register: () => Promise<void>;
  anchor: () => Promise<void>;
  /** Deletes this wallet's identity (forgotten passphrase); refused by the server once it has a coin. */
  reset: () => Promise<void>;
  refresh: () => Promise<IdentityDetail | null>;
};

const Ctx = createContext<IdentityState | null>(null);
const anchorPendingKey = (wallet: string) => `pq:anchor-pending:${wallet}`;

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { address: wallet, signMessage, signTransaction } = useWallet();
  const [detail, setDetail] = useState<IdentityDetail | null | undefined>(undefined);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [keys, setKeys] = useState<IdentityKeys | null>(null);
  const [unlocking, setUnlocking] = useState<UnlockProgress>(null);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  /** Loads the identity of wallet `w`; results for a wallet that is no longer connected are dropped. */
  const load = useCallback(async (w: string): Promise<IdentityDetail | null> => {
    try {
      const d = await api<IdentityDetail>(`/api/identity?wallet=${w}`);
      if (walletRef.current === w) {
        setDetail(d);
        setLookupError(null);
      }
      return d;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        if (walletRef.current === w) {
          setDetail(null);
          setLookupError(null);
        }
        return null;
      }
      if (walletRef.current === w) setLookupError(err instanceof Error ? err.message : "Couldn't load your identity");
      throw err;
    }
  }, []);

  const refresh = useCallback(async () => {
    const w = walletRef.current;
    if (!w) {
      setDetail(null);
      return null;
    }
    return load(w);
  }, [load]);

  // A different wallet means different keys: drop everything on change.
  useEffect(() => {
    setKeys(null);
    setLookupError(null);
    setDetail(wallet ? undefined : null);
    if (wallet) load(wallet).catch(() => {});
  }, [wallet, load]);

  const unlock = useCallback(
    async (passphrase: string) => {
      const w = walletRef.current;
      if (!w) throw new Error("Connect a wallet first");
      setUnlocking({ phase: "sign", progress: 0 });
      try {
        const registered = await load(w);
        const message = seedMessage(w);
        const signature = await signMessage(message);
        if (!ed25519.verify(signature, new TextEncoder().encode(message), new PublicKey(w).toBytes())) {
          throw new Error("Your wallet returned a signature that doesn't verify. Try another wallet.");
        }
        if (!registered) {
          // The keys are derived from this signature, so it must come out identical every time.
          const again = await signMessage(message);
          if (bytesToHex(again) !== bytesToHex(signature)) {
            throw new Error("This wallet signs the same message differently each time, so it can't hold a post-quantum identity. Use Phantom, Solflare or Backpack.");
          }
        }
        setUnlocking({ phase: passphrase ? "stretch" : "keys", progress: 0 });
        const seed = await deriveSeed(signature, w, passphrase, (p) => setUnlocking({ phase: "stretch", progress: p }));
        const k = await generateIdentity(seed, 0, (done, total) => setUnlocking({ phase: "keys", progress: done / total }));
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
    [signMessage, load],
  );

  const register = useCallback(async () => {
    const w = walletRef.current;
    if (!w || !keys) throw new Error("Unlock your keys first");
    const root = bytesToHex(keys.root);
    const pubSeed = bytesToHex(keys.pubSeed);
    const statement = registrationStatement({ wallet: w, pqAddress: keys.address, root, pubSeed, epoch: keys.epoch });
    const walletSignature = bs58.encode(await signMessage(statement));
    const digest = registrationDigest(statement);
    const signature = await withKeyLock(keys.address, async () => {
      recordSignature(keys.address, REGISTRATION_LEAF, bytesToHex(digest));
      return signatureToBase64(sign(keys, REGISTRATION_LEAF, digest));
    });
    const d = await api<IdentityDetail>("/api/identity/register", { body: { wallet: w, root, pubSeed, statement, walletSignature, signature } });
    if (walletRef.current === w) setDetail(d);
  }, [keys, signMessage]);

  const anchor = useCallback(async () => {
    const w = walletRef.current;
    if (!w) throw new Error("Connect a wallet first");
    // An anchor sent earlier that hadn't confirmed: check it before paying for another.
    const pending = localStorage.getItem(anchorPendingKey(w));
    if (pending) {
      const result = await api<IdentityDetail | { pending: true }>("/api/identity/anchor", { body: { wallet: w, signature: pending } }).catch(() => null);
      if (result && !("pending" in result)) {
        localStorage.removeItem(anchorPendingKey(w));
        if (walletRef.current === w) setDetail(result);
        return;
      }
      if (result) throw new Error("Your earlier anchor transaction hasn't confirmed yet. Check back in a minute.");
      localStorage.removeItem(anchorPendingKey(w));
    }
    const { transaction } = await api<{ transaction: string }>("/api/identity/anchor", { body: { wallet: w } });
    const signed = await signTransaction(VersionedTransaction.deserialize(fromBase64(transaction)));
    const result = await api<IdentityDetail | { pending: true; signature: string }>("/api/identity/anchor", {
      body: { wallet: w, transaction: toBase64(signed.serialize()) },
    });
    if ("pending" in result) {
      localStorage.setItem(anchorPendingKey(w), result.signature);
      throw new Error("The anchor was sent but hasn't confirmed yet. Press the button again in a minute to check; you won't pay twice.");
    }
    if (walletRef.current === w) setDetail(result);
  }, [signTransaction]);

  const reset = useCallback(async () => {
    const w = walletRef.current;
    const identity = detail?.identity;
    if (!w || !identity || identity.wallet !== w) throw new Error("Connect the wallet of this identity first");
    const statement = resetStatement({ wallet: w, pqAddress: identity.address, registeredAt: identity.createdAt });
    const signature = bs58.encode(await signMessage(statement));
    await api("/api/identity/reset", { body: { wallet: w, signature } });
    localStorage.removeItem(anchorPendingKey(w));
    if (walletRef.current === w) {
      setKeys(null);
      setDetail(null);
    }
  }, [detail, signMessage]);

  const usedLeaves = useMemo(() => {
    const used = new Set(detail?.usedLeaves.map((u) => u.leaf) ?? []);
    if (keys) for (const leaf of signedKeys(keys.address).keys()) used.add(leaf);
    return used;
  }, [detail, keys]);

  const value: IdentityState = {
    wallet,
    detail,
    lookupError,
    keys,
    unlocking,
    usedLeaves,
    remaining: LEAVES - Math.max(1, usedLeaves.size),
    unlock,
    lock: () => setKeys(null),
    register,
    anchor,
    reset,
    refresh,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useIdentity(): IdentityState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useIdentity outside IdentityProvider");
  return ctx;
}

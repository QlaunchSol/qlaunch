"use client";

import { useWallet as useAdapter } from "@solana/wallet-adapter-react";
import type { VersionedTransaction } from "@solana/web3.js";
import { useCallback } from "react";
import { useWalletModal } from "@/components/wallet-modal";

/** The connected Solana wallet, reduced to what the app needs. */
export function useWallet() {
  const { publicKey, connected, connecting, signMessage: adapterSignMessage, signTransaction: adapterSignTransaction, disconnect } = useAdapter();
  const modal = useWalletModal();

  const signMessage = useCallback(
    async (message: string): Promise<Uint8Array> => {
      if (!adapterSignMessage) throw new Error("This wallet can't sign messages. Try Phantom, Solflare or Backpack.");
      const sig = await adapterSignMessage(new TextEncoder().encode(message));
      if (!(sig instanceof Uint8Array) || sig.length !== 64) throw new Error("The wallet returned an unexpected signature");
      return sig;
    },
    [adapterSignMessage],
  );

  const signTransaction = useCallback(
    async (tx: VersionedTransaction): Promise<VersionedTransaction> => {
      if (!adapterSignTransaction) throw new Error("Connect a wallet first");
      return adapterSignTransaction(tx);
    },
    [adapterSignTransaction],
  );

  return {
    address: connected && publicKey ? publicKey.toBase58() : null,
    connecting,
    connect: modal.open,
    openAccount: modal.open,
    disconnect: () => disconnect().catch(() => {}),
    signMessage,
    signTransaction,
  };
}

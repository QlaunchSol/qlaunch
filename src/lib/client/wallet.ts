"use client";

import { useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect } from "@reown/appkit/react";
import type { Provider } from "@reown/appkit-adapter-solana/react";
import type { VersionedTransaction } from "@solana/web3.js";
import { useCallback } from "react";

/** The connected Solana wallet, reduced to what the app needs. */
export function useWallet() {
  const { address, isConnected, status } = useAppKitAccount({ namespace: "solana" });
  const { walletProvider } = useAppKitProvider<Provider>("solana");
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();

  const signMessage = useCallback(
    async (message: string): Promise<Uint8Array> => {
      if (!walletProvider) throw new Error("Connect a wallet first");
      const sig = await walletProvider.signMessage(new TextEncoder().encode(message));
      // Some wallets hand back {signature}; normalize.
      const bytes = sig instanceof Uint8Array ? sig : (sig as unknown as { signature: Uint8Array }).signature;
      if (!(bytes instanceof Uint8Array) || bytes.length !== 64) throw new Error("The wallet returned an unexpected signature");
      return bytes;
    },
    [walletProvider],
  );

  const signTransaction = useCallback(
    async (tx: VersionedTransaction): Promise<VersionedTransaction> => {
      if (!walletProvider) throw new Error("Connect a wallet first");
      return walletProvider.signTransaction(tx);
    },
    [walletProvider],
  );

  return {
    address: isConnected && address ? address : null,
    connecting: status === "connecting" || status === "reconnecting",
    connect: () => open({ view: "Connect", namespace: "solana" }),
    openAccount: () => open({ view: "Account" }),
    disconnect: () => disconnect({ namespace: "solana" }),
    signMessage,
    signTransaction,
  };
}

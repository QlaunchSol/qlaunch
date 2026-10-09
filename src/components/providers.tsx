"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import type { ReactNode } from "react";
import { site } from "@/config/site";
import { IdentityProvider } from "@/lib/client/identity";
import { WalletModalProvider } from "./wallet-modal";

// The browser never queries this RPC (the server does all chain reads); it only
// tells Mobile Wallet Adapter which cluster the app is on.
const endpoint = site.cluster === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={endpoint}>
      {/* No adapters listed: Wallet Standard wallets register themselves. */}
      <WalletProvider wallets={[]} autoConnect localStorageKey="pq:wallet">
        <WalletModalProvider>
          <IdentityProvider>{children}</IdentityProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

"use client";

import { createAppKit } from "@reown/appkit/react";
import { solana, solanaDevnet } from "@reown/appkit/networks";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import type { ReactNode } from "react";
import { site } from "@/config/site";
import { IdentityProvider } from "@/lib/client/identity";

const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || "";
if (!projectId && typeof window !== "undefined") console.warn("NEXT_PUBLIC_PROJECT_ID is not set: WalletConnect wallets won't work, browser extensions will.");

// Module scope, once per page load, as Reown requires. Real wallets only: no
// email/social logins (their keys live with a third party) and no swaps/onramp.
createAppKit({
  adapters: [new SolanaAdapter()],
  networks: site.cluster === "devnet" ? [solanaDevnet] : [solana],
  projectId: projectId || "00000000000000000000000000000000",
  metadata: { name: site.name, description: site.description, url: site.url, icons: [`${site.url}/icon.png`] },
  features: { analytics: false, email: false, socials: false, swaps: false, onramp: false, history: false, send: false, receive: false },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#5ef0b6",
    "--w3m-border-radius-master": "2px",
    "--w3m-font-family": "var(--font-geist-sans), ui-sans-serif, system-ui",
    "--w3m-z-index": 60,
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return <IdentityProvider>{children}</IdentityProvider>;
}

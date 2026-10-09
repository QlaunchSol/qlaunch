/**
 * Brand and public links. Everything user-visible that names the product comes
 * from here, so a rename is a one-file change. Protocol strings deliberately do
 * NOT (see PROTOCOL in lib/pq/params.ts): renaming must never change keys.
 */
export const site = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "Qlaunch",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://qlaunch.xyz").replace(/\/$/, ""),
  tagline: "Launch coins that outlive the curve.",
  description:
    "A pump.fun launchpad where every coin is attested by a hash-based, post-quantum one-time signature. WOTS+ keys, Merkle identities, on-chain anchors.",
  twitter: process.env.NEXT_PUBLIC_TWITTER_URL || "",
  github: process.env.NEXT_PUBLIC_GITHUB_URL || "",
  cluster: (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "devnet" ? "devnet" : "mainnet") as "mainnet" | "devnet",
} as const;

export const coinUrl = (mint: string) => `${site.url}/coin/${mint}`;
export const pumpUrl = (mint: string) => `https://pump.fun/coin/${mint}`;
export const explorerTx = (sig: string) => `https://solscan.io/tx/${sig}${site.cluster === "devnet" ? "?cluster=devnet" : ""}`;
export const explorerAccount = (addr: string) => `https://solscan.io/account/${addr}${site.cluster === "devnet" ? "?cluster=devnet" : ""}`;

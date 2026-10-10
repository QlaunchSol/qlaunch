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
  /**
   * The project's own coin: its contract address is shown above the navigation on every page.
   */
  officialCoin: { mint: "ANstzfa7HAp2zNXT63dfz13zsdLoRCx818AbdnMypump", symbol: "QLAUNCH" },
  /** The project's own wallet: the only one allowed to launch under the reserved name. */
  officialWallet: process.env.NEXT_PUBLIC_OFFICIAL_WALLET || "",
  cluster: (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "devnet" ? "devnet" : "mainnet") as "mainnet" | "devnet",
} as const;

export const coinUrl = (mint: string) => `${site.url}/coin/${mint}`;
export const pumpUrl = (mint: string) => `https://pump.fun/coin/${mint}`;
/** Where a creator claims their creator fees. */
export const pumpProfileUrl = (wallet: string) => `https://pump.fun/profile/${wallet}`;
export const explorerTx = (sig: string) => `https://solscan.io/tx/${sig}${site.cluster === "devnet" ? "?cluster=devnet" : ""}`;
export const explorerAccount = (addr: string) => `https://solscan.io/account/${addr}${site.cluster === "devnet" ? "?cluster=devnet" : ""}`;

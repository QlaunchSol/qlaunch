/**
 * Content-Security-Policy directives, shared by next.config.ts (the baseline,
 * on every response) and src/proxy.ts (the per-page-view strict policy).
 */
const gatewayOrigin = () => (process.env.PINATA_GATEWAY ? `https://${process.env.PINATA_GATEWAY}` : "");

/** Always enforced: no plugins, no framing, no <base> hijack, forms only to us, images only from us and our IPFS gateway. */
export function baselineDirectives(): string[] {
  return ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'", `img-src 'self' data: blob: ${gatewayOrigin()}`.trim()];
}

/** Scripts by nonce only, network only to us, a public Solana RPC and our gateway. */
export function strictDirectives(nonce: string): string[] {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `connect-src 'self' https://api.mainnet-beta.solana.com https://api.devnet.solana.com ws://localhost:* ${gatewayOrigin()}`.trim(),
    ...baselineDirectives(),
  ];
}

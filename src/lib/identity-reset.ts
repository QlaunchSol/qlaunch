/**
 * What a wallet signs to reset its identity (it forgot the passphrase). The
 * registration time makes it single-use: registering again, even the same
 * identity, gives a new time, so an old reset signature can't delete it.
 */
export function resetStatement(p: { wallet: string; pqAddress: string; registeredAt: string }): string {
  return [
    "Reset post-quantum identity",
    `Wallet: ${p.wallet}`,
    `Identity: ${p.pqAddress}`,
    `Registered: ${new Date(p.registeredAt).toISOString()}`,
    "It has launched no coins. Its used one-time keys stay used.",
  ].join("\n");
}

"use client";

import { useMemo } from "react";
import { identityFromHex, pqAddress, proveDigest, signatureFromBase64, verify } from "@/lib/pq";
import type { IdentityJson, Proof } from "@/lib/types";
import { VerifyAnimation } from "./verify-visual";
import { Hash, Notice, Panel, PanelHeader, SectionTitle } from "./ui";

export function ProofView({ proof, identity }: { proof: Proof; identity: IdentityJson | null }) {
  const result = useMemo(() => {
    if (!identity) return null;
    const id = identityFromHex({ root: identity.root, pubSeed: identity.pubSeed, height: identity.height, epoch: identity.epoch });
    const sig = signatureFromBase64(proof.signature);
    if (!id || !sig || sig.leaf !== proof.leaf || pqAddress(id) !== proof.pq_address) return null;
    return verify(proveDigest({ pqAddress: proof.pq_address, challenge: proof.challenge, leaf: proof.leaf, note: proof.note }), sig, id);
  }, [proof, identity]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <SectionTitle eyebrow="proof of possession" title="Identity proven" sub={`On ${new Date(proof.created_at).toUTCString()}, the holder of this identity signed a one-time server challenge.`} />
      {proof.note && (
        <Panel className="p-5">
          <div className="text-[11px] uppercase tracking-wider text-faint">Signed note</div>
          <p className="mt-1 text-lg text-fg">“{proof.note}”</p>
        </Panel>
      )}
      <Panel>
        <PanelHeader title="Re-verified in your browser" sub="Hash-based signature checked against the identity's registered Merkle root." />
        <div className="space-y-4 p-5">
          {result ? <VerifyAnimation trace={result} /> : <Notice tone="bad">This proof doesn&apos;t check out against the registered identity.</Notice>}
          <dl className="space-y-2 text-xs">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-faint">Identity</dt>
              <dd>
                <Hash value={proof.pq_address} head={12} tail={6} />
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-faint">One-time key</dt>
              <dd className="font-mono text-fg">#{proof.leaf}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-faint">Challenge</dt>
              <dd>
                <Hash value={proof.challenge} head={10} tail={8} />
              </dd>
            </div>
          </dl>
        </div>
      </Panel>
    </div>
  );
}

"use client";

import { Fingerprint, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { bytesToHex, proveDigest, signatureToBase64 } from "@/lib/pq";
import { freshLeaf, recordSignature, withKeyLock } from "@/lib/client/leaf-journal";
import { sign } from "@/lib/pq/keys";
import { api, walletErrorMessage } from "@/lib/client/api";
import { useIdentity } from "@/lib/client/identity";
import type { TokenDetail } from "@/lib/types";
import { RequireKeys } from "./unlock";
import { VerifyPanel } from "./verify-panel";
import { Button, Field, Notice, Panel, PanelHeader, SectionTitle, inputClass } from "./ui";

function parseMint(input: string): string | null {
  const s = input.trim();
  const candidate = s.match(/\/coin\/([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1] ?? s.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)?.[0];
  if (!candidate) return null;
  try {
    return new PublicKey(candidate).toBase58();
  } catch {
    return null;
  }
}

function VerifyCoin() {
  const [input, setInput] = useState("");
  const [detail, setDetail] = useState<TokenDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDetail(null);
    const mint = parseMint(input);
    if (!mint) return setError("Paste a mint address or a coin page link.");
    setLoading(true);
    try {
      setDetail(await api<TokenDetail>(`/api/token/${mint}`));
    } catch (err) {
      setError(err instanceof Error && /not found|404/i.test(err.message) ? "No attested launch with that mint." : walletErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="Verify a coin" sub="Checks the coin's post-quantum attestation end to end, in your browser." />
        <form onSubmit={submit} className="flex flex-col gap-3 p-5 sm:flex-row">
          <input className={`${inputClass} font-mono`} placeholder="Mint address or coin link" aria-label="Mint address or coin link" value={input} onChange={(e) => setInput(e.target.value)} />
          <Button type="submit" loading={loading}>
            <Search className="size-4" /> Verify
          </Button>
        </form>
        {error && <p className="px-5 pb-5 text-sm text-bad">{error}</p>}
      </Panel>
      {detail?.coin && <VerifyPanel key={detail.coin.mint} detail={detail} />}
    </div>
  );
}

function ProveIdentity() {
  const router = useRouter();
  const { keys, refresh, usedLeaves } = useIdentity();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const prove = async () => {
    if (!keys) return;
    setError(null);
    setBusy(true);
    try {
      const id = await withKeyLock(keys.address, async () => {
        const latest = await refresh();
        const leaf = freshLeaf(keys.address, new Set(latest?.usedLeaves.map((u) => u.leaf) ?? []));
        if (leaf === null) throw new Error("All one-time keys of this identity are spent.");
        const { challenge } = await api<{ challenge: string }>("/api/prove/challenge", { body: { address: keys.address } });
        const digest = proveDigest({ pqAddress: keys.address, challenge, leaf, note: note.trim() });
        recordSignature(keys.address, leaf, bytesToHex(digest)); // journaled before the signature exists
        const signature = signatureToBase64(sign(keys, leaf, digest));
        return (await api<{ id: string }>("/api/prove/verify", { body: { address: keys.address, challenge, note: note.trim(), signature } })).id;
      });
      refresh().catch(() => {});
      router.push(`/proof/${id}`);
    } catch (err) {
      setError(walletErrorMessage(err));
      refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequireKeys purpose="prove possession">
      <Panel>
        <PanelHeader title="Prove you hold an identity" sub="Signs a fresh server challenge with your next one-time key. No wallet signature involved." />
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted">
            This is the login that survives a curve break: the server checks a hash-based signature against your registered root and never consults
            ed25519. You get a public proof page anyone can re-verify.
          </p>
          <Field label="Note (optional, signed with the proof)" htmlFor="proof-note" hint="e.g. “I am the creator of $QFROG”">
            <input id="proof-note" className={inputClass} maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button onClick={prove} loading={busy}>
            <Fingerprint className="size-4" /> Sign challenge with key #{keys ? (freshLeaf(keys.address, usedLeaves) ?? "—") : "—"}
          </Button>
        </div>
      </Panel>
    </RequireKeys>
  );
}

export function VerifyView() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <SectionTitle
        eyebrow="verify"
        title="Verify, and prove"
        sub="Check any coin's attestation from public data, or prove you control a post-quantum identity without touching an elliptic curve."
      />
      <VerifyCoin />
      <ProveIdentity />
    </div>
  );
}

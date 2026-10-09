"use client";

import { Anchor, Check, KeyRound, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { explorerTx, site } from "@/config/site";
import { walletErrorMessage } from "@/lib/client/api";
import { useIdentity } from "@/lib/client/identity";
import { useWallet } from "@/lib/client/wallet";
import { TimeAgo } from "./time-ago";
import { bytesToHex } from "@/lib/pq";
import { CoinImage } from "./coin-image";
import { KeyGrid } from "./key-grid";
import { PassphraseInput, UnlockProgressBar, rememberPassphraseUse } from "./unlock";
import { Badge, Button, Field, Hash, Notice, Panel, PanelHeader, SectionTitle, cx } from "./ui";

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children?: ReactNode }) {
  return (
    <div className={cx("relative rounded-xl border p-5 transition-colors", active ? "border-mint/30 bg-panel" : "border-line bg-panel/50")}>
      <div className="flex items-center gap-3">
        <span
          className={cx(
            "flex size-7 items-center justify-center rounded-full border font-mono text-xs",
            done ? "border-mint bg-mint text-bg" : active ? "border-mint text-mint" : "border-line-2 text-faint",
          )}
        >
          {done ? <Check className="size-4" /> : n}
        </span>
        <h3 className={cx("text-sm font-semibold", active || done ? "text-fg" : "text-faint")}>{title}</h3>
      </div>
      {active && children && <div className="mt-4 pl-10">{children}</div>}
    </div>
  );
}

function CreateFlow() {
  const { address } = useWallet();
  const { keys, unlock, unlocking, register } = useIdentity();
  const [usePassphrase, setUsePassphrase] = useState(true);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = usePassphrase && confirm.length > 0 && passphrase !== confirm;
  const weak = usePassphrase && passphrase.length > 0 && passphrase.length < 12;

  const derive = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (usePassphrase && (passphrase.length < 12 || passphrase !== confirm)) return;
    try {
      await unlock(usePassphrase ? passphrase : "");
      rememberPassphraseUse(address!, usePassphrase);
    } catch (err) {
      setError(walletErrorMessage(err));
    }
  };

  const doRegister = async () => {
    setError(null);
    setBusy(true);
    try {
      await register();
    } catch (err) {
      setError(walletErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Step n={1} title="Derive your one-time keys" done={Boolean(keys)} active={!keys}>
        <form onSubmit={derive} className="max-w-md space-y-4">
          <p className="text-sm text-muted">
            Your wallet signs a fixed message. That signature, stretched together with an optional passphrase, seeds 256 Winternitz one-time keys and the
            Merkle tree over them, all computed here in your browser.
          </p>
          <label className="flex items-start gap-2.5 text-sm text-fg">
            <input type="checkbox" checked={usePassphrase} onChange={(e) => setUsePassphrase(e.target.checked)} className="mt-0.5 accent-mint" />
            <span>
              Add a passphrase <span className="text-muted">(recommended)</span>
              <span className="block text-xs text-muted">
                Without one, anyone who gets your wallet&apos;s key, including a future quantum attacker, can re-derive these keys. With one, they also need the
                passphrase.
              </span>
            </span>
          </label>
          {usePassphrase && (
            <div className="space-y-3">
              <Field label="Passphrase" error={weak ? "Use at least 12 characters: a few random words works well." : null}>
                <PassphraseInput value={passphrase} onChange={setPassphrase} placeholder="at least 12 characters" />
              </Field>
              <Field label="Confirm passphrase" error={mismatch ? "Passphrases don't match" : null}>
                <PassphraseInput value={confirm} onChange={setConfirm} />
              </Field>
              <Notice tone="warn">There is no recovery. Lose the passphrase and this identity is gone for good (your wallet and coins are unaffected).</Notice>
            </div>
          )}
          <UnlockProgressBar />
          {error && <Notice tone="bad">{error}</Notice>}
          <Button type="submit" loading={Boolean(unlocking)} disabled={usePassphrase && (passphrase.length < 12 || passphrase !== confirm)}>
            <KeyRound className="size-4" />
            Derive keys
          </Button>
        </form>
      </Step>
      <Step n={2} title="Register the identity" done={false} active={Boolean(keys)}>
        {keys && (
          <div className="max-w-xl space-y-4">
            <p className="text-sm text-muted">
              Your wallet signs a statement naming this identity, and one-time key #0 signs the same statement. That binds the two in both directions:
              neither key can be claimed by someone holding only the other.
            </p>
            <dl className="space-y-2 rounded-lg border border-line bg-panel-2 p-4 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-faint">Your pq address</dt>
                <dd>
                  <Hash value={keys.address} head={12} tail={8} />
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-faint">Merkle root</dt>
                <dd>
                  <Hash value={bytesToHex(keys.root)} head={12} tail={8} />
                </dd>
              </div>
            </dl>
            {error && <Notice tone="bad">{error}</Notice>}
            <Button onClick={doRegister} loading={busy}>
              <ShieldCheck className="size-4" />
              Sign and register
            </Button>
            <p className="text-xs text-faint">Free: this is a message signature, not a transaction.</p>
          </div>
        )}
      </Step>
      <Step n={3} title="Anchor on Solana (optional)" done={false} active={false} />
    </div>
  );
}

function RegisteredView() {
  const { detail, keys, lock, anchor } = useIdentity();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!detail) return null;
  const { identity, usedLeaves, launches } = detail;

  const doAnchor = async () => {
    setError(null);
    setBusy(true);
    try {
      await anchor();
    } catch (err) {
      setError(walletErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6">
        <Panel>
          <PanelHeader
            title="Your post-quantum identity"
            sub={<TimeAgo iso={identity.createdAt} prefix="Registered " />}
            right={
              keys ? (
                <Button variant="secondary" size="sm" onClick={lock}>
                  <Lock className="size-3.5" />
                  Lock keys
                </Button>
              ) : (
                <Badge>locked</Badge>
              )
            }
          />
          <dl className="divide-y divide-line text-sm">
            {[
              ["Address", <Hash key="a" value={identity.address} head={14} tail={8} />],
              ["Merkle root", <Hash key="r" value={identity.root} head={14} tail={8} />],
              ["Public seed", <Hash key="s" value={identity.pubSeed} head={14} tail={8} />],
              ["Wallet", <Hash key="w" value={identity.wallet} />],
            ].map(([k, v]) => (
              <div key={k as string} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <dt className="text-xs text-faint">{k}</dt>
                <dd className="text-xs">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel>
          <PanelHeader title="On-chain anchor" sub="An SPL memo that timestamps your root while ed25519 is still trustworthy." />
          <div className="space-y-3 p-5">
            {identity.anchor ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-mint">
                  <Anchor className="size-4" />
                  Anchored in slot {identity.anchor.slot?.toLocaleString("en-US")}
                </span>
                <a href={explorerTx(identity.anchor.tx)} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted hover:text-fg">
                  view transaction ↗
                </a>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted">
                  After a curve break, anyone could forge a wallet signature, but nobody can backdate a memo that is already on chain. Anchoring now
                  proves this root existed today. Costs a network fee of about 0.0001 SOL.
                </p>
                {error && <Notice tone="bad">{error}</Notice>}
                <Button variant="secondary" onClick={doAnchor} loading={busy}>
                  <Anchor className="size-4" />
                  Anchor root on Solana
                </Button>
              </>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Launches" sub={`${launches.length} signed with this identity`} />
          {launches.length ? (
            <ul className="divide-y divide-line">
              {launches.map((l) => (
                <li key={l.mint}>
                  <Link href={`/coin/${l.mint}`} className="flex items-center gap-3 px-5 py-3 hover:bg-panel-2">
                    <CoinImage src={l.image_url} alt={l.name} className="size-9 rounded-md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-fg">{l.name}</div>
                      <div className="font-mono text-xs text-faint">
                        ${l.symbol} · key #{l.leaf}
                      </div>
                    </div>
                    <Badge tone={l.status === "live" ? "mint" : l.status === "failed" ? "bad" : "warn"}>{l.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-muted">
              None yet.{" "}
              <Link href="/launch" className="text-mint hover:underline">
                Launch your first coin
              </Link>
              .
            </p>
          )}
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel>
          <PanelHeader title="One-time keys" sub="Each WOTS key signs exactly once. The database refuses a second use." />
          <div className="p-5">
            <KeyGrid used={usedLeaves} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Registration statement" sub="Signed by your wallet (ed25519) and by key #0 (WOTS)." />
          <pre className="hash overflow-x-auto whitespace-pre-wrap p-5 text-[11px] leading-relaxed text-muted">{identity.statement}</pre>
        </Panel>
      </div>
    </div>
  );
}

export function IdentityView() {
  const { address, connect } = useWallet();
  const { detail } = useIdentity();
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <SectionTitle
        eyebrow="identity"
        title="Your post-quantum identity"
        sub={`A Merkle tree of 256 hash-based one-time keys, derived from your wallet. Its root is your public key on ${site.name}; every launch you make is signed by one of its leaves.`}
      />
      {!address ? (
        <Panel className="p-8 text-center">
          <p className="text-sm text-muted">Connect a Solana wallet to create or open your identity.</p>
          <Button className="mt-4" onClick={connect}>
            Connect wallet
          </Button>
        </Panel>
      ) : detail === undefined ? (
        <Panel className="h-60 animate-pulse" />
      ) : detail === null ? (
        <CreateFlow />
      ) : (
        <RegisteredView />
      )}
    </div>
  );
}

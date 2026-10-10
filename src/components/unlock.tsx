"use client";

import { Eye, EyeOff, KeyRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useIdentity } from "@/lib/client/identity";
import { walletErrorMessage } from "@/lib/client/api";
import { useWallet } from "@/lib/client/wallet";
import { Button, Notice, Panel, Progress, inputClass } from "./ui";

const hintKey = (wallet: string) => `pq:passphrase-hint:${wallet}`;

export function rememberPassphraseUse(wallet: string, used: boolean) {
  try {
    localStorage.setItem(hintKey(wallet), used ? "1" : "0");
  } catch {}
}

function passphraseHint(wallet: string): boolean | null {
  try {
    const v = localStorage.getItem(hintKey(wallet));
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

export function PassphraseInput({ value, onChange, placeholder, autoFocus, id, label }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; id?: string; label?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        className={`${inputClass} pr-10 font-mono`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        aria-label={label ?? "Passphrase"}
      />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-fg" aria-label={show ? "Hide passphrase" : "Show passphrase"}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function UnlockProgressBar() {
  const { unlocking } = useIdentity();
  if (!unlocking) return null;
  const label = { sign: "Approve the signature in your wallet…", stretch: "Stretching passphrase (scrypt)…", keys: "Generating 256 one-time keys…" }[unlocking.phase];
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted">
        <span>{label}</span>
        {unlocking.phase !== "sign" && <span className="font-mono tabular">{Math.round(unlocking.progress * 100)}%</span>}
      </div>
      <Progress value={unlocking.phase === "sign" ? 0.02 : unlocking.progress} />
    </div>
  );
}

/**
 * Gate for pages that sign: renders children once the wallet is connected,
 * an identity is registered and its keys are unlocked in this tab.
 */
/**
 * A forgotten passphrase can't be recovered (nothing stores it), but an
 * identity that hasn't launched a coin yet can be reset and registered anew.
 */
export function ForgotPassphrase() {
  const { detail, reset } = useIdentity();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!detail) return null;
  const hasCoins = detail.launches.some((l) => l.status !== "failed");

  const confirmReset = async () => {
    setBusy(true);
    setError(null);
    try {
      await reset();
    } catch (err) {
      setError(walletErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="w-full text-xs text-faint hover:text-muted" onClick={() => setOpen(true)}>
        Forgot your passphrase?
      </button>
    );
  }
  return (
    <Notice tone="warn" title="Forgot your passphrase?">
      <div className="space-y-3 text-xs">
        <p>
          It can&apos;t be recovered: it&apos;s never stored anywhere, and your keys can&apos;t be rebuilt without it. Try the passphrases you might have
          used first.
        </p>
        {hasCoins ? (
          <p>
            This identity has launched a coin, so it can&apos;t be reset: its attestation must keep pointing at it. Your coins and wallet are unaffected;
            you just can&apos;t sign anything new with this identity.
          </p>
        ) : (
          <>
            <p>
              This identity hasn&apos;t launched a coin, so you can reset it: it&apos;s deleted, and you register a new one (with a new passphrase, it gets a
              new address). Your wallet signs the reset; nothing is paid.
            </p>
            {error && <p className="text-bad">{error}</p>}
            <div className="flex gap-2">
              <Button variant="danger" size="sm" loading={busy} onClick={confirmReset}>
                Reset my identity
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </Notice>
  );
}

/** Pages the identity page may send you back to once your identity exists. */
export const RETURN_PATHS: Record<string, string> = { "/launch": "your launch", "/verify": "your proof" };

export function RequireKeys({ children, purpose }: { children: ReactNode; purpose: string }) {
  const { address, connect } = useWallet();
  const pathname = usePathname();
  const back = RETURN_PATHS[pathname] ? pathname : null;
  const { detail, keys, unlock, unlocking, lookupError, refresh } = useIdentity();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<boolean | null>(null);

  useEffect(() => setHint(address ? passphraseHint(address) : null), [address]);

  if (keys) return <>{children}</>;

  if (!address) {
    return (
      <Panel className="p-6 text-center">
        <p className="text-sm text-muted">Connect a Solana wallet to {purpose}.</p>
        <Button className="mt-4" onClick={connect}>
          Connect wallet
        </Button>
      </Panel>
    );
  }
  if (detail === undefined && lookupError) {
    return (
      <Panel className="space-y-3 p-6 text-center">
        <p className="text-sm text-bad">Couldn&apos;t load your identity: {lookupError}</p>
        <Button variant="secondary" onClick={() => refresh().catch(() => {})}>
          Try again
        </Button>
      </Panel>
    );
  }
  if (detail === undefined) return <Panel className="h-40 animate-pulse" />;
  if (detail === null) {
    return (
      <Panel className="p-6 text-center">
        <p className="text-sm text-muted">
          This wallet doesn&apos;t have a post-quantum identity yet. Create one first: it takes a minute and costs nothing.
          {back === "/launch" && " What you've entered here is kept for when you come back."}
        </p>
        <Link href={back ? `/identity?next=${encodeURIComponent(back)}` : "/identity"} className="mt-4 inline-flex h-10 items-center rounded-md bg-mint px-4 text-sm font-medium text-bg hover:bg-mint-2">
          Create identity
        </Link>
      </Panel>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await unlock(passphrase);
      rememberPassphraseUse(address, Boolean(passphrase));
      setPassphrase("");
    } catch (err) {
      setError(walletErrorMessage(err));
    }
  };

  return (
    <Panel className="p-6">
      <form onSubmit={submit} className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-fg">
          <KeyRound className="size-4 text-mint" />
          Unlock your keys to {purpose}
        </div>
        <p className="text-xs text-muted">
          Your wallet signs a fixed message; your keys are re-derived from it here, in this tab. Nothing secret is sent anywhere, and the keys are forgotten
          when you close the tab.
        </p>
        {hint !== false && <PassphraseInput id="unlock-passphrase" label="Passphrase" value={passphrase} onChange={setPassphrase} placeholder={hint ? "Passphrase" : "Passphrase (if you set one)"} autoFocus={hint === true} />}
        <UnlockProgressBar />
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" className="w-full" loading={Boolean(unlocking)}>
          Unlock
        </Button>
        {hint === false && (
          <button type="button" className="w-full text-xs text-faint hover:text-muted" onClick={() => setHint(true)}>
            I registered with a passphrase
          </button>
        )}
        <ForgotPassphrase />
      </form>
    </Panel>
  );
}

"use client";

import { useWallet as useAdapter } from "@solana/wallet-adapter-react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { LogOut, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { short } from "@/lib/format";
import { Button, CopyButton, cx } from "./ui";

/**
 * Our own connect dialog. Wallets announce themselves through the Wallet
 * Standard (browser extensions, in-app wallet browsers, and Mobile Wallet
 * Adapter on Android), so there is no wallet service in between.
 */
const Ctx = createContext<{ open: () => void } | null>(null);

export function useWalletModal() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWalletModal outside WalletModalProvider");
  return ctx;
}

const INSTALL = [
  { name: "Phantom", url: "https://phantom.com/download", browse: (u: string) => `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(new URL(u).origin)}` },
  { name: "Solflare", url: "https://solflare.com/download", browse: (u: string) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(new URL(u).origin)}` },
  { name: "Backpack", url: "https://backpack.app/download", browse: null },
];

function Dialog({ onClose }: { onClose: () => void }) {
  const { wallets, wallet, publicKey, select, connecting, disconnect } = useAdapter();
  const [pending, setPending] = useState<WalletName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sawConnecting = useRef(false);
  const available = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);
  const mobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Selecting a wallet makes the provider connect it (autoConnect); this only
  // watches the outcome: connected → close, connecting stopped → cancelled.
  useEffect(() => {
    if (!pending) return;
    if (connecting) sawConnecting.current = true;
    if (publicKey && wallet?.adapter.name === pending) {
      setPending(null);
      onClose();
    } else if (sawConnecting.current && !connecting && !publicKey) {
      setPending(null);
      setError("The wallet didn't connect. Approve the request in your wallet, or try again.");
    }
  }, [pending, wallet, publicKey, connecting, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 backdrop-blur-sm sm:items-center" onClick={onClose} role="dialog" aria-modal aria-label="Connect a wallet">
      <div className="w-full max-w-sm animate-rise rounded-2xl border border-line-2 bg-panel shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-fg">{publicKey ? "Wallet" : "Connect a wallet"}</h2>
          <button onClick={onClose} className="rounded p-1 text-faint hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {publicKey ? (
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3 rounded-lg border border-line bg-panel-2 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {wallet && <img src={wallet.adapter.icon} alt="" className="size-8 rounded-md" />}
              <div className="min-w-0 flex-1">
                <div className="text-xs text-faint">{wallet?.adapter.name}</div>
                <div className="font-mono text-sm text-fg">{short(publicKey.toBase58(), 6, 6)}</div>
              </div>
              <CopyButton value={publicKey.toBase58()} />
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                disconnect().catch(() => {});
                onClose();
              }}
            >
              <LogOut className="size-4" /> Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            {available.length > 0 ? (
              <ul className="space-y-2">
                {available.map((w) => (
                  <li key={w.adapter.name}>
                    <button
                      onClick={() => {
                        setError(null);
                        sawConnecting.current = false;
                        setPending(w.adapter.name);
                        select(w.adapter.name);
                      }}
                      disabled={Boolean(pending)}
                      className={cx(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                        pending === w.adapter.name ? "border-mint/50 bg-mint/5" : "border-line bg-panel-2 hover:border-line-2 hover:bg-panel-3",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={w.adapter.icon} alt="" className="size-7 rounded-md" />
                      <span className="flex-1 text-fg">{w.adapter.name}</span>
                      <span className="text-[11px] text-faint">{pending === w.adapter.name ? "connecting…" : "detected"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : mobile ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">On a phone, open this page inside your wallet&apos;s built-in browser:</p>
                {INSTALL.filter((w) => w.browse).map((w) => (
                  <a key={w.name} href={w.browse!(window.location.href)} className="flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-sm text-fg hover:border-line-2">
                    Open in {w.name} <span className="text-faint">→</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">No Solana wallet found in this browser. Install one, then reload:</p>
                {INSTALL.map((w) => (
                  <a key={w.name} href={w.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-sm text-fg hover:border-line-2">
                    {w.name} <span className="text-faint">↗</span>
                  </a>
                ))}
              </div>
            )}
            {error && <p className="text-xs text-bad">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export function WalletModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Ctx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      {open && <Dialog onClose={close} />}
    </Ctx.Provider>
  );
}

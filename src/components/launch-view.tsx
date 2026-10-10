"use client";

import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { Check, ImagePlus, Rocket, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { explorerTx, site } from "@/config/site";
import { FieldError, cleanLaunchForm, type LaunchForm } from "@/lib/fields";
import { LIMITS, bytesToHex, launchDigest, signatureToBase64 } from "@/lib/pq";
import { fromBase64, toBase64 } from "@/lib/pq/bytes";
import { mintSecret, sign, type IdentityKeys } from "@/lib/pq/keys";
import { ApiError, api, walletErrorMessage } from "@/lib/client/api";
import { useIdentity } from "@/lib/client/identity";
import { inspectLaunchTx } from "@/lib/client/inspect-tx";
import { freshLeaf, markSpent, recordSignature, signedKeys, withKeyLock } from "@/lib/client/leaf-journal";
import { useWallet } from "@/lib/client/wallet";
import { short } from "@/lib/format";
import { RequireKeys } from "./unlock";
import { Badge, Button, Field, Notice, Panel, PanelHeader, SectionTitle, Spinner, cx, inputClass } from "./ui";

const MAX_DEV_BUY = 20;
type Phase = "idle" | "checking" | "signing" | "preparing" | "wallet" | "sending" | "confirming" | "sent" | "done";
const PHASES: { id: Phase; label: string }[] = [
  { id: "checking", label: "Check the launch" },
  { id: "signing", label: "Sign with a one-time key" },
  { id: "preparing", label: "Pin metadata to IPFS" },
  { id: "wallet", label: "Approve in your wallet" },
  { id: "sending", label: "Send to Solana" },
  { id: "confirming", label: "Confirm on chain" },
];
const IN_FLIGHT: Phase[] = ["signing", "preparing", "wallet", "sending", "confirming"];

const mintOf = (keys: IdentityKeys, leaf: number) => Keypair.fromSecretKey(mintSecret(keys, leaf).secretKey);
const fieldsFor = (keys: IdentityKeys, wallet: string, form: LaunchForm, leaf: number) => ({
  mint: mintOf(keys, leaf).publicKey.toBase58(),
  creator: wallet,
  pqAddress: keys.address,
  leaf,
  ...form,
});

/**
 * The key this launch should use: a key this browser already signed these
 * exact details with (a retry: same digest, harmless), otherwise a key neither
 * this browser nor the registry has ever used.
 */
function chooseLeaf(keys: IdentityKeys, wallet: string, form: LaunchForm, serverUsed: Set<number>, skip: Set<number> = new Set()): number | null {
  for (const [leaf, digest] of signedKeys(keys.address)) {
    if (leaf > 0 && !skip.has(leaf) && bytesToHex(launchDigest(fieldsFor(keys, wallet, form, leaf))) === digest) return leaf;
  }
  return freshLeaf(keys.address, new Set([...serverUsed, ...skip]));
}

function ImagePicker({ url, onUploaded, onPreview }: { url: string; onUploaded: (url: string) => void; onPreview: (src: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const upload = async (file: File) => {
    setError(null);
    if (file.size > 4 * 1024 * 1024) return setError("Image must be 4 MB or smaller");
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return setError("Use a PNG, JPEG, GIF or WebP image");
    const mine = ++sequence.current; // only the latest choice may win
    const local = URL.createObjectURL(file);
    setPreview(local);
    onPreview(local);
    onUploaded("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Upload failed");
      if (mine === sequence.current) onUploaded(json.url);
    } catch (err) {
      if (mine !== sequence.current) return;
      setError(err instanceof Error ? err.message : "Upload failed");
      setPreview(null);
      onPreview(null);
    } finally {
      if (mine === sequence.current) setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-muted">Image</span>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) upload(f);
        }}
        aria-label="Choose coin image"
        className="group relative flex aspect-square w-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-2 bg-panel-2 transition-colors hover:border-mint/50"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Coin image" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-xs text-faint group-hover:text-muted">
            <ImagePlus className="size-6" />
            Drop or choose
          </span>
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-bg/60 text-xs text-fg">
            <Spinner className="mr-2" /> Uploading…
          </span>
        )}
        {url && !uploading && (
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-mint p-0.5 text-bg">
            <Check className="size-3" />
          </span>
        )}
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {error ? (
        <p className="text-xs text-bad">{error}</p>
      ) : (
        <p className="max-w-56 text-xs text-faint">PNG, JPEG, GIF or WebP, up to 4 MB. Square looks best. It&apos;s re-encoded and stripped of metadata (like GPS) before it&apos;s published.</p>
      )}
    </div>
  );
}

export function LaunchView() {
  const router = useRouter();
  const { address, signTransaction } = useWallet();
  const { keys, detail, refresh, remaining, usedLeaves } = useIdentity();
  const [raw, setRaw] = useState({ name: "", symbol: "", description: "", image: "", twitter: "", telegram: "" });
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [devBuy, setDevBuy] = useState("0");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ mint: string; signature: string | null } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const set = (k: keyof typeof raw) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setRaw((r) => ({ ...r, [k]: e.target.value }));

  const cleaned = useMemo((): { form: LaunchForm | null; error: string | null } => {
    try {
      return { form: cleanLaunchForm(raw), error: null };
    } catch (err) {
      return { form: null, error: err instanceof FieldError ? err.message : "Invalid input" };
    }
  }, [raw]);

  const devBuySol = Number(devBuy || 0);
  const devBuyError = !Number.isFinite(devBuySol) || devBuySol < 0 ? "Enter an amount in SOL" : devBuySol > MAX_DEV_BUY ? `At most ${MAX_DEV_BUY} SOL` : null;

  useEffect(() => {
    if (!address) return setBalance(null);
    let live = true;
    const load = () =>
      api<{ sol: number }>(`/api/wallet/balance?wallet=${address}`)
        .then((b) => live && setBalance(b.sol))
        .catch(() => {});
    load();
    const t = setInterval(load, 20_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [address]);

  // Warn before leaving mid-launch: closing after signing but before sending loses the launch.
  useEffect(() => {
    if (!IN_FLIGHT.includes(phase)) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const needed = devBuySol + 0.025;
  const lowBalance = balance !== null && balance < needed;
  const busy = phase !== "idle" && phase !== "done" && phase !== "sent";
  const canLaunch = Boolean(cleaned.form && !devBuyError && keys && !busy && remaining > 0 && !lowBalance);

  /** Polls until chain confirms or rejects the coin; survives server restarts and blips. */
  /**
   * Hands the signed transaction to the server, which sends it. Sending the same signed transaction again is
   * harmless (one signature, one landing), so a server that is briefly unreachable (a deploy restarts it in
   * ~2 s) is retried for a while rather than abandoning a launch the user already signed.
   */
  const submitLaunch = useCallback(async (mint: string, transaction: string) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await api<{ status: string; signature?: string }>("/api/launch/submit", { body: { mint, transaction } });
      } catch (err) {
        const transient = !(err instanceof ApiError) || [502, 503, 504].includes(err.status);
        if (!transient || attempt >= 6 || !mounted.current) throw err;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }, []);

  const awaitLive = useCallback(async (mint: string): Promise<{ status: string; reason?: string }> => {
    for (let i = 0; i < 60 && mounted.current; i++) {
      const res = await api<{ status: string; reason?: string }>(`/api/launch/status?mint=${mint}`).catch(() => null);
      if (res && res.status !== "pending") return res;
      await new Promise((r) => setTimeout(r, i < 10 ? 2000 : 4000));
    }
    return { status: "pending" };
  }, []);

  const launch = useCallback(async () => {
    if (!cleaned.form || !keys || !address) return;
    const form = cleaned.form;
    setError(null);
    setSent(null);
    setPhase("checking");
    try {
      const prepared = await withKeyLock(keys.address, async () => {
        const latest = await refresh();
        const serverUsed = new Set(latest?.usedLeaves.map((u) => u.leaf) ?? []);
        // Everything that could fail without a signature fails in preflight, before signing. A key the
        // server or the chain already knows as spent is skipped (never signed with), and the next one tried.
        let leaf: number | null = null;
        let fields: ReturnType<typeof fieldsFor> | null = null;
        let body: Record<string, unknown> = {};
        const refused = new Set<number>();
        for (let attempt = 0; attempt < 8 && leaf === null; attempt++) {
          const candidate = chooseLeaf(keys, address, form, serverUsed, refused);
          if (candidate === null) throw new Error("All 255 launch keys of this identity are spent.");
          const f = fieldsFor(keys, address, form, candidate);
          const b = { wallet: address, mint: f.mint, leaf: candidate, ...form, devBuySol };
          try {
            const pre = await api<{ status: string }>("/api/launch/preflight", { body: b });
            if (pre.status === "live") return { mint: f.mint, status: "live" as const };
            [leaf, fields, body] = [candidate, f, b];
          } catch (err) {
            if (!(err instanceof ApiError && err.code === "key_spent")) throw err;
            markSpent(keys.address, candidate);
            refused.add(candidate);
          }
        }
        if (leaf === null || !fields) throw new Error("Couldn't find an unused one-time key. Refresh and try again.");
        const digest = launchDigest(fields);

        setPhase("signing");
        recordSignature(keys.address, leaf, bytesToHex(digest)); // journaled before the signature exists
        const signature = signatureToBase64(sign(keys, leaf, digest));
        setPhase("preparing");
        const res = await api<{ transaction?: string; metadataUri: string; status: string }>("/api/launch/prepare", {
          body: { ...body, signature, digest: bytesToHex(digest) },
        });
        return { ...res, mint: fields.mint, leaf };
      });
      refresh().catch(() => {});
      if (prepared.status === "live") {
        setPhase("done");
        return router.push(`/coin/${prepared.mint}?launched=1`);
      }
      if (!("transaction" in prepared) || !prepared.transaction) throw new Error("The server didn't return a transaction. Try again.");

      setPhase("wallet");
      const tx = VersionedTransaction.deserialize(fromBase64(prepared.transaction));
      inspectLaunchTx(tx, { wallet: address, mint: prepared.mint, name: form.name, symbol: form.symbol, uri: prepared.metadataUri, devBuySol });
      // The wallet signs first (some wallets amend a transaction before signing), then the mint key.
      const signed = await signTransaction(tx);
      signed.sign([mintOf(keys, prepared.leaf!)]);

      setPhase("sending");
      setSent({ mint: prepared.mint, signature: null });
      // A failure here may still have landed: confirmation is decided by polling chain, not by this response.
      const submitted = await submitLaunch(prepared.mint, toBase64(signed.serialize())).catch((err: unknown) => ({ status: "unknown", error: err }));
      if ("signature" in submitted && submitted.signature) setSent({ mint: prepared.mint, signature: submitted.signature });

      setPhase("confirming");
      const result = submitted.status === "live" ? { status: "live" } : await awaitLive(prepared.mint);
      if (!mounted.current) return;
      if (result.status === "live") {
        setPhase("done");
        router.push(`/coin/${prepared.mint}?launched=1`);
      } else if (result.status === "failed") {
        setPhase("idle");
        setError("reason" in result && result.reason ? `The launch was rejected: ${result.reason}` : "The launch didn't go through.");
      } else if ("error" in submitted && submitted.status === "unknown") {
        setPhase("idle");
        setError(`${walletErrorMessage(submitted.error)} If the transaction did land, the coin will appear on your identity page; retrying with the same details is safe.`);
      } else {
        setPhase("sent");
      }
    } catch (err) {
      if (!mounted.current) return;
      setPhase("idle");
      setError(walletErrorMessage(err));
    }
  }, [cleaned.form, keys, address, devBuySol, refresh, signTransaction, router, awaitLive, submitLaunch]);

  const preview = useMemo(() => {
    if (!keys || !address || !cleaned.form) return null;
    const leaf = chooseLeaf(keys, address, cleaned.form, usedLeaves);
    if (leaf === null) return null;
    return { leaf, mint: mintOf(keys, leaf).publicKey.toBase58() };
  }, [keys, address, cleaned.form, usedLeaves]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <SectionTitle
        eyebrow="launch"
        title="Launch a coin"
        sub="It goes live on pump.fun's bonding curve in one transaction, with a post-quantum signature over its name, ticker, image and description pinned into its metadata."
      />
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Panel>
          <PanelHeader title="Coin details" sub="Everything here is signed. It can't be changed after launch." />
          <div className="space-y-5 p-5">
            <Notice tone="ok" title="Creator fees are yours">
              Your wallet is the coin&apos;s creator on pump.fun, so pump.fun pays its creator fees from every trade to you. Claim them on pump.fun any time.{" "}
              {site.name} takes no fee.
            </Notice>
            <div className="flex flex-col gap-5 sm:flex-row">
              <ImagePicker url={raw.image} onUploaded={(image) => setRaw((r) => ({ ...r, image }))} onPreview={setPreviewSrc} />
              <div className="flex-1 space-y-4">
                <Field label="Name" htmlFor="name">
                  <input id="name" className={inputClass} value={raw.name} onChange={set("name")} maxLength={LIMITS.name * 2} placeholder="Quantum Frog" autoComplete="off" />
                </Field>
                <Field label="Ticker" htmlFor="symbol">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-faint">$</span>
                    <input id="symbol" className={`${inputClass} pl-6 font-mono`} value={raw.symbol} onChange={set("symbol")} maxLength={LIMITS.symbol} placeholder="QFROG" autoComplete="off" />
                  </div>
                </Field>
              </div>
            </div>
            <Field label="Description" htmlFor="description" hint={`${[...raw.description].length}/${LIMITS.description}`}>
              <textarea id="description" className={`${inputClass} min-h-24 resize-y`} value={raw.description} onChange={set("description")} maxLength={LIMITS.description * 2} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="X (optional)" htmlFor="twitter">
                <input id="twitter" className={inputClass} value={raw.twitter} onChange={set("twitter")} placeholder="@handle or link" autoComplete="off" />
              </Field>
              <Field label="Telegram (optional)" htmlFor="telegram">
                <input id="telegram" className={inputClass} value={raw.telegram} onChange={set("telegram")} placeholder="@group or t.me link" autoComplete="off" />
              </Field>
            </div>
            <Field
              label="Dev buy (optional)"
              htmlFor="devbuy"
              error={devBuyError}
              hint="Your own first buy, in the same transaction as the launch: nobody can get in ahead of you."
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-36">
                  <input id="devbuy" type="number" min={0} max={MAX_DEV_BUY} step="0.01" className={`${inputClass} pr-12 font-mono`} value={devBuy} onChange={(e) => setDevBuy(e.target.value)} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">SOL</span>
                </div>
                {["0", "0.1", "0.5", "1"].map((v) => (
                  <button key={v} type="button" onClick={() => setDevBuy(v)} className={cx("rounded-md border px-2.5 py-1.5 font-mono text-xs", devBuy === v ? "border-mint/50 text-mint" : "border-line-2 text-muted hover:text-fg")}>
                    {v}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Preview" />
            <div className="flex gap-3 p-5">
              <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-panel-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {previewSrc && <img src={previewSrc} alt="" className="size-full object-cover" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold text-fg">{raw.name || "Your coin"}</span>
                  <ShieldCheck className="size-3.5 shrink-0 text-mint" />
                </div>
                <div className="truncate font-mono text-xs text-muted">${raw.symbol || "TICKER"}</div>
                <p className="mt-1 line-clamp-2 break-words text-xs text-muted">{raw.description || "Description"}</p>
              </div>
            </div>
            {keys && preview && (
              <div className="border-t border-line px-5 py-3 font-mono text-[11px] text-faint">
                signs with key #{preview.leaf} of {short(keys.address, 8, 4)} · mint {short(preview.mint, 4, 4)}
              </div>
            )}
          </Panel>

          <RequireKeys purpose="launch">
            <Panel>
              <PanelHeader title="Launch" sub={`${remaining} one-time keys left on this identity`} right={detail?.identity.anchor ? <Badge tone="mint">anchored</Badge> : <Badge>not anchored</Badge>} />
              <div className="space-y-4 p-5">
                <ul className="space-y-1.5 text-xs text-muted">
                  <li className="flex justify-between">
                    <span>pump.fun creation (rent)</span>
                    <span className="font-mono">≈ 0.02 SOL</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Dev buy</span>
                    <span className="font-mono">{devBuySol > 0 ? `${devBuySol} SOL` : "none"}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Network and priority fee</span>
                    <span className="font-mono">≈ 0.0001 SOL</span>
                  </li>
                  <li className="flex justify-between">
                    <span>{site.name} fee</span>
                    <span className="font-mono">none</span>
                  </li>
                  <li className="flex justify-between text-mint">
                    <span>Creator fees from trading</span>
                    <span className="font-mono">to your wallet</span>
                  </li>
                  {balance !== null && (
                    <li className={cx("flex justify-between border-t border-line pt-1.5", lowBalance ? "text-bad" : "")}>
                      <span>Wallet balance</span>
                      <span className="font-mono">{balance.toFixed(4)} SOL</span>
                    </li>
                  )}
                </ul>

                {phase !== "idle" && phase !== "sent" && (
                  <ol className="space-y-1.5" aria-live="polite">
                    {PHASES.map((p, i) => {
                      const at = PHASES.findIndex((x) => x.id === phase);
                      const state = phase === "done" || i < at ? "done" : i === at ? "active" : "todo";
                      return (
                        <li key={p.id} className={cx("flex items-center gap-2 text-xs", state === "todo" ? "text-faint" : "text-fg")}>
                          {state === "done" ? <Check className="size-3.5 text-mint" /> : state === "active" ? <Spinner className="text-mint" /> : <span className="size-3.5" />}
                          {p.label}
                        </li>
                      );
                    })}
                  </ol>
                )}

                {phase === "sent" && sent && (
                  <Notice tone="info" title="Sent, still confirming">
                    Your launch was sent but hasn&apos;t confirmed yet. It will appear on{" "}
                    <Link href="/identity" className="text-ice underline">
                      your identity page
                    </Link>{" "}
                    once it lands.
                    {sent.signature && (
                      <a href={explorerTx(sent.signature)} target="_blank" rel="noreferrer" className="mt-1 block text-ice underline">
                        View the transaction ↗
                      </a>
                    )}
                  </Notice>
                )}
                {error && (
                  <Notice tone="bad" title="Launch didn't go through">
                    <span className="break-words">{error}</span>
                  </Notice>
                )}
                {cleaned.error && (raw.name || raw.symbol) && <p className="text-xs text-warn">{cleaned.error}</p>}
                {lowBalance && <p className="text-xs text-bad">You need about {needed.toFixed(3)} SOL in this wallet.</p>}

                <Button size="lg" className="w-full" onClick={launch} disabled={!canLaunch} loading={busy}>
                  <Rocket className="size-4" />
                  {busy ? "Launching…" : "Sign and launch"}
                </Button>
                {!cleaned.form && !busy && <p className="text-center text-xs text-faint">Add a name, ticker and image to launch.</p>}
              </div>
            </Panel>
          </RequireKeys>
        </div>
      </div>
    </div>
  );
}

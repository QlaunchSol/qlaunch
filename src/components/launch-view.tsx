"use client";

import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { Check, ImagePlus, Rocket, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { site } from "@/config/site";
import { FieldError, cleanLaunchForm, type LaunchForm } from "@/lib/fields";
import { LIMITS, bytesToHex, launchDigest, signatureToBase64 } from "@/lib/pq";
import { fromBase64, toBase64 } from "@/lib/pq/bytes";
import { mintSecret, sign } from "@/lib/pq/keys";
import { ApiError, api, walletErrorMessage } from "@/lib/client/api";
import { useIdentity } from "@/lib/client/identity";
import { useWallet } from "@/lib/client/wallet";
import { short } from "@/lib/format";
import { RequireKeys } from "./unlock";
import { Badge, Button, Field, Notice, Panel, PanelHeader, SectionTitle, Spinner, cx, inputClass } from "./ui";

const MAX_DEV_BUY = 20;
type Phase = "idle" | "signing" | "preparing" | "wallet" | "sending" | "confirming" | "done";
const PHASES: { id: Phase; label: string }[] = [
  { id: "signing", label: "Sign with a one-time key" },
  { id: "preparing", label: "Pin metadata to IPFS" },
  { id: "wallet", label: "Approve in your wallet" },
  { id: "sending", label: "Send to Solana" },
  { id: "confirming", label: "Confirm the coin" },
];

/** A launch that reached the server keeps its key and mint: retrying it never wastes a key. */
type Attempt = { wallet: string; leaf: number; form: string };
const ATTEMPT_KEY = "pq:launch-attempt";
const loadAttempt = (): Attempt | null => {
  try {
    return JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) ?? "null");
  } catch {
    return null;
  }
};
const saveAttempt = (a: Attempt | null) => {
  try {
    if (a) sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(a));
    else sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {}
};

function ImagePicker({ url, onUrl }: { url: string; onUrl: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setError(null);
    if (file.size > 4 * 1024 * 1024) return setError("Image must be 4 MB or smaller");
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return setError("Use a PNG, JPEG, GIF or WebP image");
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Upload failed");
      onUrl(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPreview(null);
      onUrl("");
    } finally {
      setUploading(false);
    }
  };

  const shown = preview ?? (url || null);
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
        className="group relative flex aspect-square w-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-2 bg-panel-2 transition-colors hover:border-mint/50"
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Coin image" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-xs text-faint group-hover:text-muted">
            <ImagePlus className="size-6" />
            Drop or choose
          </span>
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-bg/60 text-xs text-fg">
            <Spinner className="mr-2" /> Pinning…
          </span>
        )}
        {url && !uploading && (
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-mint p-0.5 text-bg">
            <Check className="size-3" />
          </span>
        )}
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {error ? <p className="text-xs text-bad">{error}</p> : <p className="text-xs text-faint">PNG, JPEG, GIF or WebP, up to 4 MB. Square looks best.</p>}
    </div>
  );
}

export function LaunchView() {
  const router = useRouter();
  const { address, signTransaction } = useWallet();
  const { keys, detail, nextLeaf, refresh, remaining } = useIdentity();
  const [raw, setRaw] = useState({ name: "", symbol: "", description: "", image: "", twitter: "", telegram: "" });
  const [devBuy, setDevBuy] = useState("0");
  const [acknowledged, setAcknowledged] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

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
    const t = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [address]);

  const needed = devBuySol + 0.025;
  const lowBalance = balance !== null && balance < needed;
  const busy = phase !== "idle" && phase !== "done";
  const canLaunch = Boolean(cleaned.form && !devBuyError && acknowledged && keys && !busy && remaining > 0);

  const launch = useCallback(async () => {
    if (!cleaned.form || !keys || !address) return;
    setError(null);
    const formJson = JSON.stringify(cleaned.form);
    const prior = loadAttempt();
    const reuse = prior && prior.wallet === address && prior.form === formJson ? prior.leaf : null;
    const leaf = reuse ?? nextLeaf(prior && prior.wallet === address ? [prior.leaf] : []);
    if (leaf === null) return setError("All 255 launch keys of this identity are spent.");

    const mintKeys = mintSecret(keys, leaf);
    const mint = Keypair.fromSecretKey(mintKeys.secretKey);
    const fields = { mint: mint.publicKey.toBase58(), creator: address, pqAddress: keys.address, leaf, ...cleaned.form };

    try {
      setPhase("signing");
      const digest = launchDigest(fields);
      const signature = signatureToBase64(sign(keys, leaf, digest));
      await new Promise((r) => setTimeout(r, 250)); // let the step render

      setPhase("preparing");
      saveAttempt({ wallet: address, leaf, form: formJson });
      const prepared = await api<{ transaction: string }>("/api/launch/prepare", {
        body: { wallet: address, mint: fields.mint, ...cleaned.form, devBuySol, signature, digest: bytesToHex(digest) },
      }).finally(() => refresh().catch(() => {}));

      setPhase("wallet");
      const tx = VersionedTransaction.deserialize(fromBase64(prepared.transaction));
      // The wallet signs first (some wallets amend a transaction before signing), then the mint key.
      const signed = await signTransaction(tx);
      signed.sign([mint]);

      setPhase("sending");
      let status = await api<{ status: string }>("/api/launch/submit", { body: { mint: fields.mint, transaction: toBase64(signed.serialize()) } });
      setPhase("confirming");
      for (let i = 0; status.status !== "live" && i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        status = await api<{ status: string }>("/api/launch/submit", { body: { mint: fields.mint } });
      }
      if (status.status !== "live") throw new Error("The transaction was sent but the coin hasn't appeared yet. It will show up on your identity page once it lands.");
      saveAttempt(null);
      setPhase("done");
      refresh().catch(() => {});
      router.push(`/coin/${fields.mint}?launched=1`);
    } catch (err) {
      setPhase("idle");
      if (err instanceof ApiError && err.status === 409 && /already used/.test(err.message)) saveAttempt(null);
      setError(walletErrorMessage(err));
    }
  }, [cleaned.form, keys, address, nextLeaf, devBuySol, refresh, signTransaction, router]);

  const preview = useMemo(() => {
    if (!keys || !address || !cleaned.form) return null;
    const prior = loadAttempt();
    const leaf = prior && prior.wallet === address && prior.form === JSON.stringify(cleaned.form) ? prior.leaf : nextLeaf(prior && prior.wallet === address ? [prior.leaf] : []);
    if (leaf === null) return null;
    return { leaf, mint: Keypair.fromSecretKey(mintSecret(keys, leaf).secretKey).publicKey.toBase58() };
  }, [keys, address, cleaned.form, nextLeaf]);

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
            <div className="flex flex-col gap-5 sm:flex-row">
              <ImagePicker url={raw.image} onUrl={(image) => setRaw((r) => ({ ...r, image }))} />
              <div className="flex-1 space-y-4">
                <Field label="Name" htmlFor="name">
                  <input id="name" className={inputClass} value={raw.name} onChange={set("name")} maxLength={LIMITS.name} placeholder="Quantum Frog" />
                </Field>
                <Field label="Ticker" htmlFor="symbol">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-faint">$</span>
                    <input id="symbol" className={`${inputClass} pl-6 font-mono`} value={raw.symbol} onChange={set("symbol")} maxLength={LIMITS.symbol} placeholder="QFROG" />
                  </div>
                </Field>
              </div>
            </div>
            <Field label="Description" htmlFor="description" hint={`${[...raw.description].length}/${LIMITS.description}`}>
              <textarea id="description" className={`${inputClass} min-h-24 resize-y`} value={raw.description} onChange={set("description")} maxLength={LIMITS.description} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="X (optional)" htmlFor="twitter">
                <input id="twitter" className={inputClass} value={raw.twitter} onChange={set("twitter")} placeholder="@handle or link" />
              </Field>
              <Field label="Telegram (optional)" htmlFor="telegram">
                <input id="telegram" className={inputClass} value={raw.telegram} onChange={set("telegram")} placeholder="@group or t.me link" />
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
                {raw.image && <img src={raw.image} alt="" className="size-full object-cover" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold text-fg">{raw.name || "Your coin"}</span>
                  <ShieldCheck className="size-3.5 text-mint" />
                </div>
                <div className="font-mono text-xs text-muted">${raw.symbol || "TICKER"}</div>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{raw.description || "Description"}</p>
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
                  {balance !== null && (
                    <li className={cx("flex justify-between border-t border-line pt-1.5", lowBalance ? "text-bad" : "")}>
                      <span>Wallet balance</span>
                      <span className="font-mono">{balance.toFixed(4)} SOL</span>
                    </li>
                  )}
                </ul>

                <label className="flex items-start gap-2.5 rounded-lg border border-warn/25 bg-warn/5 p-3 text-xs text-muted">
                  <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 accent-mint" />
                  <span>
                    I understand that pump.fun&apos;s <span className="text-fg">creator fees on this coin go to the {site.name} treasury</span>, not to my wallet: the
                    treasury is the coin&apos;s on-chain creator. My wallet signs and pays for the launch, and the post-quantum attestation names me as the
                    launcher.
                  </span>
                </label>

                {phase !== "idle" && (
                  <ol className="space-y-1.5">
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

                {error && (
                  <Notice tone="bad" title="Launch didn't go through">
                    {error}
                    {loadAttempt() && <span className="mt-1 block text-faint">Retrying with the same details reuses the same key and mint.</span>}
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

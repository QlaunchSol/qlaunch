"use client";

import { Flag, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Notice, cx, inputClass } from "./ui";

const REASONS = [
  { value: "illegal", label: "Illegal content" },
  { value: "sexual", label: "Sexual or explicit image" },
  { value: "violence", label: "Violence or gore" },
  { value: "scam", label: "Scam or phishing" },
  { value: "impersonation", label: "Impersonates a person, project or brand" },
  { value: "other", label: "Something else" },
];

/** "Report" link on coin pages: sends the coin to the moderation queue. */
export function ReportButton({ mint }: { mint: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      await api("/api/report", { body: { mint, reason, details } });
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the report");
      setState("idle");
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-faint transition-colors hover:text-bad">
        <Flag className="size-3" /> Report
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 backdrop-blur-sm sm:items-center" onClick={() => setOpen(false)} role="dialog" aria-modal aria-label="Report this coin">
          <div className="w-full max-w-md animate-rise rounded-2xl border border-line-2 bg-panel shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-fg">Report this coin</h2>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-faint hover:text-fg" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            {state === "sent" ? (
              <div className="space-y-4 p-5">
                <Notice tone="ok" title="Thanks, it's in the review queue.">Coins that break the rules are taken down from this site and their images removed from our IPFS pins.</Notice>
                <Button variant="secondary" className="w-full" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4 p-5">
                <fieldset className="space-y-1.5">
                  <legend className="mb-2 text-xs font-medium text-muted">What&apos;s wrong?</legend>
                  {REASONS.map((r) => (
                    <label key={r.value} className={cx("flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm", reason === r.value ? "border-mint/50 bg-mint/5 text-fg" : "border-line text-muted hover:border-line-2")}>
                      <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-mint" />
                      {r.label}
                    </label>
                  ))}
                </fieldset>
                <textarea className={`${inputClass} min-h-20`} maxLength={500} placeholder="Details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} aria-label="Details" />
                {error && <p className="text-xs text-bad">{error}</p>}
                <Button type="submit" className="w-full" disabled={!reason} loading={state === "sending"}>
                  Send report
                </Button>
                <p className="text-[11px] leading-relaxed text-faint">
                  For content that endangers a child, also report it to your national hotline (for example NCMEC&apos;s CyberTipline or the IWF).
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

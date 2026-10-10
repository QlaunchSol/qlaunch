"use client";

import { Check, CircleMinus, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { verifyCoin, type CoinVerification, type Verdict } from "@/lib/client/verify-coin";
import type { TokenDetail } from "@/lib/types";
import { VerifyAnimation } from "./verify-visual";
import { Button, Panel, PanelHeader, Spinner, cx } from "./ui";

export function VerifyPanel({ detail, onVerdict }: { detail: TokenDetail; onVerdict?: (v: Verdict | null) => void }) {
  const [result, setResult] = useState<CoinVerification | null>(null);
  const [running, setRunning] = useState(false);
  const [round, setRound] = useState(0);
  const detailRef = useRef(detail);
  detailRef.current = detail;
  const onVerdictRef = useRef(onVerdict);
  onVerdictRef.current = onVerdict;
  // Re-verify only when what is being verified changes, not on every data refresh.
  const key = `${detail.coin?.mint}:${detail.identity?.root ?? ""}:${detail.attestation?.digest ?? ""}`;

  const run = useCallback(async () => {
    setRunning(true);
    onVerdictRef.current?.(null);
    try {
      const r = await verifyCoin(detailRef.current);
      setResult(r);
      onVerdictRef.current?.(r.verdict);
      setRound((n) => n + 1);
    } catch {
      setResult({ steps: [{ id: "error", title: "Verification", ok: null, detail: "Couldn't run the verification. Check your connection and re-verify." }], trace: null, verdict: "unknown" });
      onVerdictRef.current?.("unknown");
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [key, run]);

  return (
    <Panel>
      <PanelHeader
        title="Post-quantum verification"
        sub="Run in your browser, from public data. Nothing here takes the server's word for it."
        right={
          <Button variant="secondary" size="sm" onClick={run} loading={running}>
            <RotateCw className="size-3.5" />
            Re-verify
          </Button>
        }
      />
      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1.1fr]">
        <ol className="space-y-3">
          {!result && running && (
            <li className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Fetching metadata…
            </li>
          )}
          {result?.steps.map((s) => (
            <li key={s.id} className="flex gap-3">
              <span
                className={cx(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                  s.ok === true ? "bg-mint/15 text-mint" : s.ok === false ? "bg-bad/15 text-bad" : "bg-panel-3 text-faint",
                )}
              >
                {s.ok === true ? <Check className="size-3" /> : s.ok === false ? <X className="size-3" /> : <CircleMinus className="size-3" />}
              </span>
              <div className="min-w-0">
                <div className="text-sm text-fg">{s.title}</div>
                <div className="hash text-xs text-muted">{s.detail}</div>
              </div>
            </li>
          ))}
          {result && (
            <li
              className={cx(
                "rounded-lg border px-3 py-2 text-sm font-medium",
                result.verdict === "valid" ? "border-mint/40 bg-mint/5 text-mint" : result.verdict === "invalid" ? "border-bad/40 bg-bad/5 text-bad" : "border-warn/40 bg-warn/5 text-warn",
              )}
            >
              {result.verdict === "valid"
                ? "Verified: this coin was launched by the identity above."
                : result.verdict === "invalid"
                  ? "Verification failed. Treat this coin's provenance as unproven."
                  : "Couldn't finish checking right now (network). Nothing failed; re-verify in a moment."}
            </li>
          )}
        </ol>
        <div>{result?.trace ? <VerifyAnimation trace={result.trace} playKey={round} /> : <div className="h-72 rounded-lg bg-panel-2" />}</div>
      </div>
    </Panel>
  );
}

"use client";

import { Check, CircleMinus, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { verifyCoin, type CoinVerification } from "@/lib/client/verify-coin";
import type { IdentityJson } from "@/lib/types";
import { VerifyAnimation } from "./verify-visual";
import { Button, Panel, PanelHeader, Spinner, cx } from "./ui";

export function VerifyPanel({ mint, identity, autoRun = true }: { mint: string; identity: IdentityJson | null; autoRun?: boolean }) {
  const [result, setResult] = useState<CoinVerification | null>(null);
  const [running, setRunning] = useState(false);
  const [round, setRound] = useState(0);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      setResult(await verifyCoin(mint, identity));
      setRound((r) => r + 1);
    } catch {
      setResult({ steps: [{ id: "error", title: "Verification", ok: false, detail: "Couldn't run the verification. Check your connection." }], trace: null, valid: false, metadata: null });
    } finally {
      setRunning(false);
    }
  }, [mint, identity]);

  useEffect(() => {
    if (autoRun) run();
  }, [autoRun, run]);

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
                result.valid ? "border-mint/40 bg-mint/5 text-mint" : "border-bad/40 bg-bad/5 text-bad",
              )}
            >
              {result.valid ? "Verified: this coin was launched by the identity above." : "Verification failed. Treat this coin's provenance as unproven."}
            </li>
          )}
        </ol>
        <div>{result?.trace ? <VerifyAnimation trace={result.trace} playKey={round} /> : <div className="h-72 rounded-lg bg-panel-2" />}</div>
      </div>
    </Panel>
  );
}

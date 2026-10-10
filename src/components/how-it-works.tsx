import { ArrowRight, KeyRound, Rocket, ScanSearch, ShieldCheck } from "lucide-react";
import Link from "next/link";

const STEPS = [
  { icon: KeyRound, title: "Derive", body: "Your wallet signs once; 256 hash-based one-time keys are generated from it, in your browser. Nothing secret leaves the tab." },
  { icon: ShieldCheck, title: "Register", body: "Your wallet and key #0 sign the same statement, binding them both ways. Anchor the root on Solana while ed25519 still holds." },
  { icon: Rocket, title: "Launch", body: "A fresh key signs your coin's name, ticker, image and description. It goes live on pump.fun's curve in one transaction." },
  { icon: ScanSearch, title: "Verify", body: "Anyone checks the signature with SHA-256 alone: on the coin page, in their browser, or with a dependency-free Python script." },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-mint">how it works</div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-fg">Proof of origin that doesn&apos;t depend on the curve</h2>
        </div>
        <Link href="/docs" className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg">
          Read the protocol <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative rounded-xl border border-line bg-panel p-5">
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg border border-mint/25 bg-mint/10 text-mint">
                <s.icon className="size-[18px]" />
              </span>
              <span className="font-mono text-xs text-faint">0{i + 1}</span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-fg">{s.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

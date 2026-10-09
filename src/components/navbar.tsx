"use client";

import { KeyRound, LockKeyhole, Menu, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { site } from "@/config/site";
import { useIdentity } from "@/lib/client/identity";
import { useWallet } from "@/lib/client/wallet";
import { short } from "@/lib/format";
import { Wordmark } from "./logo";
import { Button, cx } from "./ui";

const LINKS = [
  { href: "/", label: "Coins" },
  { href: "/launch", label: "Launch" },
  { href: "/identity", label: "Identity" },
  { href: "/verify", label: "Verify" },
  { href: "/docs", label: "Docs" },
];

function IdentityChip() {
  const { detail, keys } = useIdentity();
  if (!detail) return null;
  return (
    <Link
      href="/identity"
      className="hidden items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 font-mono text-xs text-muted transition-colors hover:text-fg md:flex"
      title={keys ? "Keys unlocked in this tab" : "Keys locked"}
    >
      {keys ? <KeyRound className="size-3.5 text-mint" /> : <LockKeyhole className="size-3.5" />}
      {short(detail.identity.address, 7, 4)}
    </Link>
  );
}

function WalletButton() {
  const { address, connecting, connect, openAccount } = useWallet();
  if (address) {
    return (
      <Button variant="secondary" size="sm" onClick={openAccount} className="font-mono">
        <Wallet className="size-3.5 text-mint" />
        {short(address)}
      </Button>
    );
  }
  return (
    <Button size="sm" onClick={connect} loading={connecting}>
      Connect wallet
    </Button>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/coin/") : pathname.startsWith(href));
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-15 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Link href="/" onClick={() => setOpen(false)}>
            <Wordmark name={site.name} />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cx("rounded-md px-3 py-1.5 text-sm transition-colors", active(l.href) ? "text-fg" : "text-muted hover:text-fg")}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <IdentityChip />
          <WalletButton />
          <button className="rounded-md p-2 text-muted hover:text-fg md:hidden" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-4 py-2 md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={cx("block rounded-md px-3 py-2.5 text-sm", active(l.href) ? "bg-panel-2 text-fg" : "text-muted")}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

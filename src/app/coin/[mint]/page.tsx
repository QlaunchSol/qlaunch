import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CoinView } from "@/components/coin-view";
import { tokenDetail } from "@/lib/server/coins";
import { configured } from "@/lib/server/env";
import { isPubkey } from "@/lib/server/validate";

export const dynamic = "force-dynamic";

async function load(mint: string) {
  if (!isPubkey(mint) || !configured.db()) return null;
  const detail = await tokenDetail(mint).catch(() => null);
  return detail?.coin ? detail : null;
}

export async function generateMetadata({ params }: PageProps<"/coin/[mint]">): Promise<Metadata> {
  const detail = await load((await params).mint);
  if (!detail?.coin) return { title: "Coin not found" };
  const { name, symbol, description, image } = detail.coin;
  return {
    title: `${name} ($${symbol})`,
    description: description || `${name} ($${symbol}), launched with a post-quantum attestation.`,
    openGraph: { title: `${name} ($${symbol})`, description: description || undefined, images: [{ url: image }] },
  };
}

export default async function CoinPage({ params }: PageProps<"/coin/[mint]">) {
  const detail = await load((await params).mint);
  if (!detail) notFound();
  return (
    <Suspense>
      <CoinView initial={detail} />
    </Suspense>
  );
}

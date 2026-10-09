import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProofView } from "@/components/proof-view";
import { identityByAddress, proofById } from "@/lib/server/db";
import { configured } from "@/lib/server/env";
import { identityJson } from "@/lib/server/identity";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proof of possession" };

export default async function ProofPage({ params }: PageProps<"/proof/[id]">) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{12}$/.test(id) || !configured.db()) notFound();
  const proof = await proofById(id);
  if (!proof) notFound();
  const identity = await identityByAddress(proof.pq_address);
  return <ProofView proof={proof} identity={identity ? identityJson(identity) : null} />;
}

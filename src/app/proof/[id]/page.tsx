import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProofView } from "@/components/proof-view";
import { db, identityByAddress, maybe } from "@/lib/server/db";
import { configured } from "@/lib/server/env";
import { identityJson } from "@/lib/server/identity";
import type { Proof } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proof of possession" };

export default async function ProofPage({ params }: PageProps<"/proof/[id]">) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{12}$/.test(id) || !configured.db()) notFound();
  const proof = maybe(await db().from("proofs").select("id, pq_address, leaf, challenge, note, digest, signature, created_at").eq("id", id).maybeSingle<Proof>());
  if (!proof) notFound();
  const identity = await identityByAddress(proof.pq_address);
  return <ProofView proof={proof} identity={identity ? identityJson(identity) : null} />;
}

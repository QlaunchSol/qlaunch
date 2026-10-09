import type { Metadata } from "next";
import { IdentityView } from "@/components/identity-view";

export const metadata: Metadata = { title: "Identity" };

export default function IdentityPage() {
  return <IdentityView />;
}

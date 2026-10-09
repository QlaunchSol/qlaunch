import type { Metadata } from "next";
import { VerifyView } from "@/components/verify-view";

export const metadata: Metadata = { title: "Verify" };

export default function VerifyPage() {
  return <VerifyView />;
}

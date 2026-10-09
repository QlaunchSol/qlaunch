import type { Metadata } from "next";
import { LaunchView } from "@/components/launch-view";

export const metadata: Metadata = { title: "Launch a coin" };

export default function LaunchPage() {
  return <LaunchView />;
}

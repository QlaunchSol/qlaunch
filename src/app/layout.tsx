import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { OfficialBanner } from "@/components/official-coin";
import { officialCoin } from "@/lib/server/official";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { Providers } from "@/components/providers";
import { site } from "@/config/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name}: post-quantum launchpad`, template: `%s · ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#07090b", colorScheme: "dark" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the per-request nonce renders every page dynamically, so each gets its own (see proxy.ts).
  await headers();
  const official = await officialCoin();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          {site.cluster === "devnet" && (
            <div className="border-b border-warn/30 bg-warn/10 px-4 py-1.5 text-center text-xs text-warn">
              Devnet staging: coins, SOL and fees here are test tokens with no value. Switch your wallet to devnet to try it.
            </div>
          )}
          {official && <OfficialBanner coin={official} />}
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

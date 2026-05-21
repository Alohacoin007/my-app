import "./globals.css";
import type { Metadata, Viewport } from "next";
import { BottomNav } from "@/components/BottomNav";
import { BetSlipProvider } from "@/components/BetSlipProvider";
import { BetSlipDock } from "@/components/BetSlipDock";

export const metadata: Metadata = {
  title: "Alohabet — Sportsbook",
  description: "Trade NFL, MLB, NBA lines with a virtual bankroll.",
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-soft">
        <BetSlipProvider>
          <div className="container-app min-h-screen bg-white pb-24 shadow-xl">
            {children}
          </div>
          <BetSlipDock />
          <BottomNav />
        </BetSlipProvider>
      </body>
    </html>
  );
}

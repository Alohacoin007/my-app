import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BetBoard — Sports Betting Dashboard",
  description:
    "Sports betting dashboard prototype on a draggable, resizable 24x24 grid",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

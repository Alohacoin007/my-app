import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BetBoard — 스포츠 베팅 대시보드",
  description:
    "드래그·리사이즈 가능한 24x24 그리드 기반 스포츠 베팅 대시보드 프로토타입",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}

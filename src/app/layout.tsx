import type { Metadata } from "next";
import { Fraunces, Inter, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { MetaPixel } from "@/components/MetaPixel";

// 디스플레이용 세리프 (히어로 타이틀 등)
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["italic", "normal"],
  weight: ["300", "400"],
});

// 본문 라틴
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// 한글 본문
const notoKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "samae — 취향에 맞는 사진작가 매칭",
  description:
    "사진작가를 탐색하고, 채팅으로 협의하고, 예약·결제부터 보정본 수령까지 한 흐름에서.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      className={`${fraunces.variable} ${inter.variable} ${notoKr.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-fg">
        {children}
        <AnalyticsTracker />
        <MetaPixel />
      </body>
    </html>
  );
}

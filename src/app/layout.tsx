import type { Metadata } from "next";
import { Fraunces, Inter, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { MixpanelTracker } from "@/components/MixpanelTracker";
import { MetaPixel } from "@/components/MetaPixel";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION } from "@/lib/site";

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
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "samae",
    "사매",
    "사진작가",
    "사진작가 매칭",
    "스냅 촬영",
    "프로필 사진",
    "웨딩 스냅",
    "커플 스냅",
    "사진 예약",
    "촬영 문의",
  ],
  alternates: { canonical: "/" },
  // 구글 서치 콘솔 인증 — NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION 에 토큰 넣으면 <head>에 렌더됨.
  // Meta(Facebook) 도메인 인증 — ATT 이후 iOS 전환 측정에 필수.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: {
      "facebook-domain-verification": "k68lrant37edz9cnuiibojjski29tw",
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ko_KR",
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
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
        <MixpanelTracker />
        <MetaPixel />
        {/* Vercel Web Analytics — 페이지뷰·방문자·웹바이탈 (Mixpanel 과 별개, 인프라 지표용) */}
        <Analytics />
      </body>
    </html>
  );
}

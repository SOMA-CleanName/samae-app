import type { Metadata } from "next";
import { Fraunces, Inter, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { MixpanelTracker } from "@/components/MixpanelTracker";
import { MetaPixel } from "@/components/MetaPixel";
import { NavEntryProbe } from "@/components/NavEntryProbe";
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
      <head>
        {/*
          브라우저의 자동 스크롤 복원을 끈다.

          새로고침하면 브라우저가 이전 scrollY 를 되돌리는데, 그 순간 화면에 있는 건
          **로딩 스켈레톤**이라 문서가 훨씬 짧다(홈 실측: 본문 7291px vs 스켈레톤 1806px).
          되돌릴 자리가 없으니 최대 스크롤로 잘리고, 사용자는 스켈레톤 밑부분을 보게 된다.
          게다가 그 잘린 값이 ScrollMemory 에 다시 저장돼(1500 → 962) 새로고침할 때마다
          위치가 깎여 내려간다(실측 2026-09-12).

          스켈레톤과 본문의 높이를 맞추는 건 불가능하다 — 본문 길이는 사진 수에 달렸다.
          그래서 **새로고침은 항상 최상단에서 시작**한다. 스켈레톤이 보이는 동안과
          로드된 뒤의 위치가 같아진다.

          앱 안에서의 이동(뒤로가기·사진 상세 복귀)은 문서가 그대로라 영향이 없다 —
          그 복원은 ScrollMemory 가 sessionStorage 로 따로 한다.

          ⚠️ 인라인 스크립트여야 한다. 컴포넌트에서 켜면 하이드레이션 뒤라 이미 늦다.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if('scrollRestoration' in history)history.scrollRestoration='manual'",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        {children}
        {/* 뒤로가기가 "온 곳"으로 갈 수 있는지 판정하려면 문서 진입 시점을 잡아야 한다 */}
        <NavEntryProbe />
        <AnalyticsTracker />
        <MixpanelTracker />
        <MetaPixel />
        {/* Vercel Web Analytics — 페이지뷰·방문자·웹바이탈 (Mixpanel 과 별개, 인프라 지표용) */}
        <Analytics />
      </body>
    </html>
  );
}

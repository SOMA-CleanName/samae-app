"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Meta(페이스북) 픽셀 — 광고 전환 추적.
// App Router 는 <head> 직접 삽입 대신 next/script 로 주입한다.
// SPA 라우팅이라 최초 진입 PageView 는 인라인 스크립트가 보내고,
// 이후 페이지 이동마다 fbq PageView 를 다시 전송한다.
const PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function MetaPixel() {
  const pathname = usePathname();
  const loaded = useRef(false);

  // 라우트 변경 시 PageView 재전송 (최초 1회는 인라인 스크립트가 이미 보냄)
  useEffect(() => {
    if (!PIXEL_ID) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    window.fbq?.("track", "PageView");
  }, [pathname]);

  // 픽셀 ID 미설정 시 아무것도 로드하지 않음 (로컬·프리뷰에서 오염 방지)
  if (!PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}

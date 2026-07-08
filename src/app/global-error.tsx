"use client";

// 루트 레이아웃 단계에서 발생한 렌더 에러 폴백 — Sentry 캡처 + 간단한 복구 UI.
// (일반 페이지 에러는 각 라우트의 error.tsx 가 처리; 이건 최상위 치명 에러용)
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0b0d",
          color: "#f4f2ef",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 15, color: "#9a948b", marginBottom: 12 }}>
            일시적인 오류가 발생했어요
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 20px", lineHeight: 1.4 }}>
            잠시 후 다시 시도해주세요
          </h1>
          <button
            onClick={() => reset()}
            style={{
              background: "#ff3d2e",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "13px 28px",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}

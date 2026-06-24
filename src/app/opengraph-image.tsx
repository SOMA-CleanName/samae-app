import { ImageResponse } from "next/og";

// 전역 기본 OG 이미지 — 카톡/SNS 공유 시 썸네일. 모든 라우트의 기본값으로 적용된다.
// (한글 글꼴 로딩 의존을 피하려고 이미지 안 텍스트는 라틴 워드마크만 사용. 제목·설명 한글은 메타태그가 담당.)
export const alt = "samae — 취향에 맞는 사진작가 매칭";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ff3d2e",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 180, fontWeight: 800, letterSpacing: -6, lineHeight: 1 }}>
          samae
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 34,
            fontWeight: 500,
            letterSpacing: 14,
            textTransform: "uppercase",
            opacity: 0.92,
          }}
        >
          photographer matching
        </div>
      </div>
    ),
    { ...size }
  );
}

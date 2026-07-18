import { ImageResponse } from "next/og";

export const runtime = "nodejs";

// 인스타 스토리 규격(1080×1920) 공유 카드. 결과 화면이 label·palette를 쿼리로 전달.
// (분석 데이터는 영속 저장하지 않으므로 카드에 필요한 최소값만 URL로 받음)

// 한글 렌더용 폰트 1회 로드 (Satori는 제공한 폰트만 씀 — 없으면 한글이 깨짐)
let fontCache: ArrayBuffer | null = null;
async function loadKoreanFont(): Promise<ArrayBuffer | null> {
  if (fontCache) return fontCache;
  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-700-normal.woff",
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    fontCache = await res.arrayBuffer();
    return fontCache;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const label = (searchParams.get("label") ?? "나의 촬영 페르소나").slice(0, 40);
  const palette = (searchParams.get("palette") ?? "#ff3d2e,#241a18,#f3f1ec")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 5);
  const accent = palette[0] ?? "#ff3d2e";

  const font = await loadKoreanFont();

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
          padding: "120px 90px",
          background: `radial-gradient(120% 70% at 50% 0%, ${accent}33 0%, #141210 55%, #0c0b0a 100%)`,
          color: "#f3f1ec",
          fontFamily: font ? "Noto" : "sans-serif",
        }}
      >
        <div style={{ fontSize: 34, letterSpacing: 10, color: "#ff8d80", display: "flex" }}>
          MY 촬영 페르소나
        </div>
        <div
          style={{
            marginTop: 60,
            fontSize: 108,
            lineHeight: 1.15,
            fontWeight: 700,
            textAlign: "center",
            display: "flex",
          }}
        >
          {label}
        </div>
        <div style={{ marginTop: 70, display: "flex", gap: 24 }}>
          {palette.map((c, i) => (
            <div key={i} style={{ width: 84, height: 84, borderRadius: 999, background: c, display: "flex" }} />
          ))}
        </div>
        <div style={{ position: "absolute", bottom: 110, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 40, fontWeight: 700, display: "flex" }}>samae</div>
          <div style={{ fontSize: 30, color: "rgba(243,241,236,0.6)", display: "flex" }}>
            너의 촬영 페르소나는? samae에서 확인
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      fonts: font ? [{ name: "Noto", data: font, weight: 700, style: "normal" }] : [],
    }
  );
}

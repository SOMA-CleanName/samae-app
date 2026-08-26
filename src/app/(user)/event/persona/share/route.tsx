import { ImageResponse } from "next/og";
import { muteHex } from "@/lib/persona/palette-theme";

export const runtime = "nodejs";

// 인스타 스토리 규격(1080×1920) 공유 카드.
//
// 이 카드가 바이럴 루프의 실질 광고판이다 — 링크 미리보기(OG)와 스토리 공유 양쪽에 쓰인다.
// 라벨·팔레트만 있던 v1 에서 **추천 사진 3장**을 추가했다. 남의 결과 카드에서
// 시선을 끄는 건 텍스트가 아니라 사진이고, 사진이 곧 사매의 상품이다.
//
// 데이터는 전부 쿼리로 받는다(label · palette · p=사진URL×3).
// 분석 결과를 이 라우트가 다시 조회하지 않는 이유: 카드 요청은 OG 크롤러가
// 아무 인증 없이 때리므로, DB 를 태우면 그게 곧 무료 부하 지점이 된다.

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

/** 사진 URL 은 자사 Supabase 스토리지만 허용 — 임의 URL 을 서버가 fetch 하게 두면
 *  이 라우트가 SSRF 프록시가 된다. */
function isAllowedPhotoUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabase) return false;
    return url.protocol === "https:" && url.host === new URL(supabase).host;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const label = (searchParams.get("label") ?? "나의 촬영 페르소나").slice(0, 40);
  const palette = (searchParams.get("palette") ?? "#ff3d2e,#241a18,#f3f1ec")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => /^#[0-9a-f]{6}$/i.test(c))
    .slice(0, 5);
  const photos = searchParams.getAll("p").filter(isAllowedPhotoUrl).slice(0, 3);
  const accent = palette[0] ?? "#ff3d2e";
  // 결과 화면 히어로와 같은 뮤트 변환 — 미리보기(OG)와 착지 화면의 톤이 이어진다
  const wash = muteHex(accent);

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
          padding: "150px 80px 120px",
          background: `radial-gradient(120% 60% at 50% 0%, ${wash}30 0%, #141210 50%, #0c0b0a 100%)`,
          color: "#f3f1ec",
          fontFamily: font ? "Noto" : "sans-serif",
        }}
      >
        <div style={{ fontSize: 32, letterSpacing: 12, color: "#ff8d80", display: "flex" }}>
          내 촬영 페르소나
        </div>

        <div
          style={{
            marginTop: 44,
            fontSize: 92,
            lineHeight: 1.2,
            fontWeight: 700,
            textAlign: "center",
            display: "flex",
            // Satori 는 word-break: keep-all 미지원 — 길이 제한(40자)으로 대신 막는다
          }}
        >
          {label}
        </div>

        {/* 팔레트 — 이 결과의 지문 */}
        <div style={{ marginTop: 52, display: "flex", gap: 22 }}>
          {palette.map((c, i) => (
            <div
              key={i}
              style={{
                width: 72,
                height: 72,
                borderRadius: 999,
                background: c,
                border: "2px solid rgba(243,241,236,0.18)",
                display: "flex",
              }}
            />
          ))}
        </div>

        {/* 추천 사진 3장 — 카드의 시선을 끄는 실제 상품.
            가운데 장을 크게, 양옆을 살짝 기울여 '골라준 사진 뭉치' 느낌을 준다 */}
        {photos.length > 0 && (
          <div
            style={{
              marginTop: 96,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 0,
            }}
          >
            {photos.map((src, i) => {
              const mid = photos.length === 1 || i === 1;
              // Satori 제약: z-index 미지원, transform 은 "none"/퍼센트 불가(절대 px 만).
              // 기울임 없이 가운데만 키우고 살짝 겹치는 배치로 같은 인상을 낸다.
              return (
                // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
                <img
                  key={i}
                  src={src}
                  width={mid ? 470 : 340}
                  height={mid ? 618 : 447}
                  style={{
                    objectFit: "cover",
                    borderRadius: 28,
                    border: "3px solid rgba(243,241,236,0.14)",
                    marginLeft: i === 0 ? 0 : -40,
                    marginTop: mid ? 0 : 56,
                    boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
                  }}
                />
              );
            })}
          </div>
        )}

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div style={{ fontSize: 44, fontWeight: 700, color: "#ff3d2e", display: "flex" }}>samae</div>
          <div style={{ fontSize: 30, color: "rgba(243,241,236,0.65)", display: "flex" }}>
            인스타 아이디 하나면 끝 · 당신의 촬영 페르소나는?
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

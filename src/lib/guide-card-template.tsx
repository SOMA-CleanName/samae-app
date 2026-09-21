import { ImageResponse } from "next/og";
import { MAX_CARD_BODY, type KbCard } from "./bot-kb";
import {
  BACKDROPS,
  UPLOAD_VEIL,
  inkOf,
  type FontKey,
  type GuideStyle,
  type TemplateKey,
} from "./guide-style";

// 사매 안내 이미지 — 저장된 KB 카드를 작가가 고른 양식으로 구워낸다.
//
// 레퍼런스(인스타 안내물 13종)에서 읽은 공통 규칙이 모든 템플릿에 깔려 있다:
//   · 카드마다 박스를 두르지 않는다 — 박스가 반복되면 안내물이 아니라 목록으로 읽힌다
//   · 크림/오프화이트 바탕, 머리카락처럼 얇은 선, 넉넉한 여백
//   · 세리프 영문 헤더 + 한글 본문
//
// 양식을 고치는 곳은 여기 한 곳이다 — 미리보기·발행이 모두 이 함수를 쓴다.

const WIDTH = 1080;
/**
 * 글자 크기 — 1080px 폭 기준.
 *
 * 처음엔 본문 31px 였는데, 이 그림이 실제로 보이는 곳은 폰 화면이다. 1080 짜리가
 * 400px 로 줄어들면 31px 는 11px 가 된다 — 안내물이 아니라 각주 크기다. 그래서
 * 본문을 40px 로 올리고 좌우 여백을 줄여 줄당 글자 수를 지켰다.
 */
const TYPE = {
  body: 40,
  label: 32,
  head: 28,
  headSub: 26,
  foot: 24,
  titleKo: 48,
  titleEn: 88,
  brand: 36,
};

/**
 * 줄당 들어가는 한글 글자 수.
 *
 * 폭 ÷ 글자크기 로만 세면 **늘 모자라게 나온다.** 한국어는 어절 단위로 끊기므로
 * (word-break: keep-all) 줄 끝에 다음 어절이 안 들어가면 그대로 비우고 내려간다 —
 * 실제로 채워지는 건 폭의 9할쯤이다. 그 낭비를 안 빼면 줄 수를 적게 잡고,
 * 높이가 모자라 마지막 줄이 잘린다.
 */
const WRAP_FILL = 0.9;
const perLine = (width: number) => Math.floor((width / TYPE.body) * WRAP_FILL);

const PER_LINE = perLine(766); // 17

const MIN_HEIGHT = 1080; // 정사각 아래로는 안 내려간다 — 너무 납작하면 안내물로 안 보인다

// 한 장에 카드 8장까지. 본문 상한은 KB 와 같은 값을 쓴다 — 여기서 더 짧게 자르면
// 저장된 카드가 이미지에서만 말줄임 없이 뚝 끊긴다.
export const MAX_CARDS_PER_CARD = 8;
export const MAX_BODY = MAX_CARD_BODY;

/**
 * 안내 이미지 한 장 = 토픽 묶음. 배열 순서가 곧 스와이프 순서다.
 * 토픽 1:1 로 뽑으면 카드 1장짜리 장이 우수수 나와 안내물이 파편화된다.
 */
export const GUIDE_SHEETS: { label: string; en: string; topics: string[] }[] = [
  { label: "가격·구성", en: "Price", topics: ["서비스", "가격", "진행방식"] },
  { label: "컨셉", en: "Concept", topics: ["컨셉"] },
  {
    label: "촬영 당일",
    en: "On the day",
    topics: ["소요시간", "촬영장소", "준비물", "인원", "촬영진행", "일정변경", "출장"],
  },
  { label: "보정·수정", en: "Retouch", topics: ["보정", "수정"] },
  { label: "원본·납품", en: "Delivery", topics: ["원본", "셀렉", "납품", "보관", "포트폴리오", "문의"] },
];

export type GuideSheet = { label: string; en: string; cards: KbCard[] };

/**
 * 카드를 장으로 나눈다. 카드가 없는 장은 만들지 않는다.
 *
 * 두 가지를 보장한다 — 둘 다 "조용히 사라지는 카드" 를 막기 위한 것이다.
 *   · topic 은 자유 입력이라 위 목록이 전부를 덮을 수 없다. 어디에도 안 잡힌 토픽은
 *     마지막 "그 외" 장으로 쓸어담는다.
 *   · 한 장에 들어가는 카드 수에는 상한이 있다. 넘치면 잘라내지 않고 장을 쪼갠다.
 */
export function groupCardsIntoSheets(cards: KbCard[]): GuideSheet[] {
  const claimed = new Set(GUIDE_SHEETS.flatMap((s) => s.topics));
  const grouped: GuideSheet[] = GUIDE_SHEETS.map((s) => ({
    label: s.label,
    en: s.en,
    cards: cards.filter((c) => s.topics.includes(c.topic)),
  })).filter((s) => s.cards.length > 0);

  const rest = cards.filter((c) => !claimed.has(c.topic));
  if (rest.length > 0) grouped.push({ label: "그 외 안내", en: "More", cards: rest });

  return grouped.flatMap((s) => {
    if (s.cards.length <= MAX_CARDS_PER_CARD) return [s];
    const total = Math.ceil(s.cards.length / MAX_CARDS_PER_CARD);
    return Array.from({ length: total }, (_, i) => ({
      label: `${s.label} (${i + 1}/${total})`,
      en: s.en,
      cards: s.cards.slice(i * MAX_CARDS_PER_CARD, (i + 1) * MAX_CARDS_PER_CARD),
    }));
  });
}

// ── 질감 배경 ───────────────────────────────────────────────────
/**
 * public/guide-bg 의 질감 그림을 data URI 로 읽는다.
 *
 * Satori 의 <img> 는 절대 URL 이나 data URI 만 받는다. 로컬 파일 경로는 못 쓰고,
 * 절대 URL 은 배포 환경마다 달라져 깨지기 쉽다 — 그래서 파일을 직접 읽어 실어 보낸다.
 * 한 번 읽으면 프로세스가 살아 있는 동안 캐시한다(파일은 커밋된 고정 자산이다).
 */
const textureCache = new Map<string, string | null>();
async function textureDataUri(file: string): Promise<string | null> {
  const hit = textureCache.get(file);
  if (hit !== undefined) return hit;
  try {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const buf = await readFile(path.join(process.cwd(), "public", "guide-bg", file));
    const uri = `data:image/jpeg;base64,${buf.toString("base64")}`;
    textureCache.set(file, uri);
    return uri;
  } catch {
    // 파일이 없으면 CSS 배경으로 떨어진다 — 이미지가 아예 안 나오는 것보다 낫다
    textureCache.set(file, null);
    return null;
  }
}

// ── 폰트 ────────────────────────────────────────────────────────
const fontCache = new Map<string, ArrayBuffer>();
async function loadFont(path: string): Promise<ArrayBuffer | null> {
  const hit = fontCache.get(path);
  if (hit) return hit;
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/${path}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    fontCache.set(path, buf);
    return buf;
  } catch {
    return null;
  }
}

/**
 * 글씨체 묶음. `Sans`·`Serif`·`Latin` 은 **역할 이름**이지 서체 이름이 아니다 —
 * 본문 / 제목 / 영문 자리에 어떤 파일을 끼울지만 여기서 갈아 끼운다. 그래서
 * 템플릿 코드는 글씨체가 바뀌어도 한 줄도 안 건드린다.
 *
 * `[400 파일, 굵은 파일]` — 굵은 파일이 없는 서체(고운돋움)는 400 을 그대로 쓴다.
 */
export const FONT_SETS: Record<
  FontKey,
  { sans: [string, string]; serif: [string, string]; latin: string }
> = {
  sans: {
    sans: ["noto-sans-kr@latest/korean-400-normal.woff", "noto-sans-kr@latest/korean-500-normal.woff"],
    serif: ["noto-serif-kr@latest/korean-400-normal.woff", "noto-serif-kr@latest/korean-600-normal.woff"],
    latin: "cormorant-garamond@latest/latin-300-normal.woff",
  },
  gowun: {
    sans: ["gowun-dodum@latest/korean-400-normal.woff", "gowun-dodum@latest/korean-400-normal.woff"],
    serif: ["gowun-batang@latest/korean-400-normal.woff", "gowun-batang@latest/korean-700-normal.woff"],
    latin: "eb-garamond@latest/latin-400-normal.woff",
  },
  myeongjo: {
    sans: ["nanum-myeongjo@latest/korean-400-normal.woff", "nanum-myeongjo@latest/korean-700-normal.woff"],
    serif: ["nanum-myeongjo@latest/korean-700-normal.woff", "nanum-myeongjo@latest/korean-800-normal.woff"],
    latin: "cormorant-garamond@latest/latin-300-normal.woff",
  },
  batang: {
    sans: ["noto-serif-kr@latest/korean-400-normal.woff", "noto-serif-kr@latest/korean-600-normal.woff"],
    serif: ["noto-serif-kr@latest/korean-600-normal.woff", "noto-serif-kr@latest/korean-700-normal.woff"],
    latin: "lora@latest/latin-400-normal.woff",
  },
  plex: {
    sans: ["ibm-plex-sans-kr@latest/korean-400-normal.woff", "ibm-plex-sans-kr@latest/korean-500-normal.woff"],
    serif: ["ibm-plex-sans-kr@latest/korean-500-normal.woff", "ibm-plex-sans-kr@latest/korean-500-normal.woff"],
    latin: "jost@latest/latin-300-normal.woff",
  },
};

async function loadFonts(font: FontKey) {
  const set = FONT_SETS[font] ?? FONT_SETS.sans;
  const [sans, sansM, serif, serifM, latin, symbols] = await Promise.all([
    loadFont(set.sans[0]),
    loadFont(set.sans[1]),
    loadFont(set.serif[0]),
    loadFont(set.serif[1]),
    loadFont(set.latin),
    // 화살표(→)·기호용 — 한글 subset 에 없어서 두부(□)로 나온다. 작가 자료에
    // "문의 → 상담 → 촬영" 같은 표기가 흔해 빠뜨릴 수 없다.
    loadFont("noto-sans-symbols-2@latest/symbols-400-normal.woff"),
  ]);
  const out = [];
  if (sans) out.push({ name: "Sans", data: sans, weight: 400 as const, style: "normal" as const });
  if (sansM) out.push({ name: "Sans", data: sansM, weight: 500 as const, style: "normal" as const });
  if (serif) out.push({ name: "Serif", data: serif, weight: 400 as const, style: "normal" as const });
  if (serifM) out.push({ name: "Serif", data: serifM, weight: 600 as const, style: "normal" as const });
  if (latin) out.push({ name: "Latin", data: latin, weight: 300 as const, style: "normal" as const });
  // Sans 뒤에 같은 이름으로 쌓으면 앞 폰트에 없는 글자만 여기서 찾는다(폴백)
  if (symbols) out.push({ name: "Sans", data: symbols, weight: 400 as const, style: "normal" as const });
  return out;
}

/** 한글 기준 줄 수 어림 — 폭과 글자크기로 대략 센다(영문·숫자가 섞이면 여백이 조금 늘 뿐) */
function lines(text: string, perLine: number) {
  return Math.max(1, Math.ceil(Math.min(text.length, MAX_BODY) / perLine));
}

type Ink = ReturnType<typeof inkOf>;
type Ctx = { sheet: GuideSheet; name: string; ink: Ink; style: GuideStyle; bgImage: string | null };

// ── 바깥 틀 ─────────────────────────────────────────────────────
/** 배경은 여기서만 칠한다. 업로드 사진이면 깔고 그 위에 종이 한 겹을 덮는다. */
function Frame({
  style,
  ink,
  pad,
  bgImage,
  children,
}: {
  style: GuideStyle;
  ink: Ink;
  pad: string;
  /** 깔 그림 — 작가가 올린 사진이거나 프리셋 질감 */
  bgImage?: string | null;
  children: React.ReactNode;
}) {
  const preset = BACKDROPS.find((b) => b.key === style.backdrop) ?? BACKDROPS[0];
  const inner = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: pad,
        // 작가가 올린 사진 위에서는 종이를 덮어 글자 대비를 확보한다.
        // 프리셋 질감은 애초에 옅게 만들어 둬서 덮지 않는다.
        background: style.backdropUrl ? UPLOAD_VEIL : "transparent",
      }}
    >
      {children}
    </div>
  );

  if (!bgImage) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: preset.background,
          color: ink.ink,
          fontFamily: "Sans",
          // 한국어는 어절 단위로 끊어야 읽힌다 — 없으면 "포함됩니 / 다." 처럼 잘린다
          wordBreak: "keep-all",
        }}
      >
        {inner}
      </div>
    );
  }
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        color: ink.ink,
        fontFamily: "Sans",
        wordBreak: "keep-all",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img
        src={bgImage}
        width={WIDTH}
        height={4000}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      {inner}
    </div>
  );
}

function Footer({ ink, center }: { ink: Ink; center?: boolean }) {
  if (center) {
    return (
      <div
        style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto", paddingTop: 64 }}
      >
        <div style={{ display: "flex", width: 110, height: 1, background: ink.line }} />
        <div style={{ display: "flex", marginTop: 18, fontFamily: "Latin", fontSize: TYPE.brand, color: ink.inkSoft }}>
          samae
        </div>
        <div style={{ display: "flex", marginTop: 4, fontSize: TYPE.foot, color: ink.inkFaint }}>
          상담은 사매 채팅으로
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", marginTop: "auto", paddingTop: 48, alignItems: "center" }}>
      <div style={{ display: "flex", fontFamily: "Latin", fontSize: TYPE.brand, color: ink.inkSoft }}>samae</div>
      <div style={{ display: "flex", marginLeft: "auto", fontSize: TYPE.foot, color: ink.inkFaint }}>
        사매에서 확인한 촬영 정보
      </div>
    </div>
  );
}

// ── 템플릿 ──────────────────────────────────────────────────────
function TLabel({ sheet, name, ink, style, bgImage }: Ctx) {
  // 같은 주제가 이어지면 라벨을 한 번만 — 신문 기사처럼 읽히게
  const rows = sheet.cards.map((c, i) => ({
    ...c,
    showLabel: c.topic !== sheet.cards[i - 1]?.topic,
  }));
  return (
    <Frame style={style} ink={ink} pad="88px 72px" bgImage={bgImage}>
      <div style={{ display: "flex", alignItems: "baseline" }}>
        <div style={{ display: "flex", fontSize: TYPE.head, letterSpacing: 6, color: ink.inkFaint }}>{name}</div>
        <div style={{ display: "flex", marginLeft: "auto", fontSize: TYPE.headSub, color: ink.inkFaint }}>촬영 안내</div>
      </div>
      <div style={{ display: "flex", marginTop: 56, fontFamily: "Latin", fontSize: TYPE.titleEn }}>{sheet.en}</div>
      <div style={{ display: "flex", marginTop: 6, fontFamily: "Serif", fontSize: TYPE.titleKo, fontWeight: 600 }}>
        {sheet.label}
      </div>
      <div style={{ display: "flex", marginTop: 20, width: "100%", height: 1, background: ink.line }} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              gap: 34,
              paddingTop: 36,
              paddingBottom: 36,
              borderBottom: `1px solid ${ink.line}`,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 136,
                minWidth: 136,
                fontSize: TYPE.label,
                fontWeight: 500,
                color: r.showLabel ? ink.inkSoft : "transparent",
                paddingTop: 5,
              }}
            >
              {r.topic}
            </div>
            <div style={{ display: "flex", width: 766, fontSize: TYPE.body, lineHeight: 1.6 }}>
              {r.body.slice(0, MAX_BODY)}
            </div>
          </div>
        ))}
      </div>
      <Footer ink={ink} />
    </Frame>
  );
}
const hLabel = (s: GuideSheet) =>
  340 + s.cards.reduce((a, c) => a + lines(c.body, PER_LINE) * 64 + 73, 0) + 190;

function TLetter({ sheet, name, ink, style, bgImage }: Ctx) {
  return (
    <Frame style={style} ink={ink} pad="104px 84px" bgImage={bgImage}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        <div style={{ display: "flex", fontSize: TYPE.head, letterSpacing: 8, color: ink.inkFaint }}>{name}</div>
        <div style={{ display: "flex", marginTop: 60, fontFamily: "Latin", fontSize: TYPE.titleEn }}>{sheet.en}</div>
        <div style={{ display: "flex", marginTop: 10, fontFamily: "Serif", fontSize: TYPE.titleKo, color: ink.inkSoft }}>
          {sheet.label}
        </div>
        <div style={{ display: "flex", marginTop: 48, width: 1, height: 64, background: ink.accent }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 48, gap: 46 }}>
          {sheet.cards.map((c) => (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", fontSize: TYPE.label, letterSpacing: 3, color: ink.inkFaint }}>{c.topic}</div>
              <div style={{ display: "flex", width: 852, fontSize: TYPE.body, lineHeight: 1.7, textAlign: "center" }}>
                {c.body.slice(0, MAX_BODY)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Footer ink={ink} center />
    </Frame>
  );
}
const hLetter = (s: GuideSheet) =>
  392 + s.cards.reduce((a, c) => a + 42 + lines(c.body, perLine(852)) * 68 + 46, 0) + 292;

function TLedger({ sheet, name, ink, style, bgImage }: Ctx) {
  return (
    <Frame style={style} ink={ink} pad="88px 72px" bgImage={bgImage}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
        <div style={{ display: "flex", fontFamily: "Serif", fontSize: TYPE.titleKo, fontWeight: 600 }}>{sheet.label}</div>
        <div style={{ display: "flex", fontFamily: "Latin", fontSize: 36, color: ink.inkFaint, paddingBottom: 6 }}>
          {sheet.en}
        </div>
        <div style={{ display: "flex", marginLeft: "auto", fontSize: TYPE.headSub, color: ink.inkFaint, paddingBottom: 8 }}>
          {name}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 26, width: "100%", height: 2, background: ink.ink }} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {sheet.cards.map((c, i) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              gap: 32,
              paddingTop: 30,
              paddingBottom: 30,
              borderBottom: `1px solid ${ink.line}`,
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: "Latin",
                fontSize: 34,
                color: ink.inkFaint,
                width: 58,
                minWidth: 58,
                paddingTop: 6,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <div style={{ display: "flex", width: 844, flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", fontSize: TYPE.label, fontWeight: 500, color: ink.inkSoft }}>{c.topic}</div>
              <div style={{ display: "flex", fontSize: TYPE.body, lineHeight: 1.6 }}>{c.body.slice(0, MAX_BODY)}</div>
            </div>
          </div>
        ))}
      </div>
      <Footer ink={ink} />
    </Frame>
  );
}
const hLedger = (s: GuideSheet) =>
  186 + s.cards.reduce((a, c) => a + 42 + 10 + lines(c.body, perLine(844)) * 64 + 61, 0) + 180;

function TFlow({ sheet, name, ink, style, bgImage }: Ctx) {
  return (
    <Frame style={style} ink={ink} pad="92px 72px" bgImage={bgImage}>
      <div style={{ display: "flex", alignItems: "baseline" }}>
        <div style={{ display: "flex", fontFamily: "Latin", fontSize: 36, color: ink.inkFaint }}>{name}</div>
        <div style={{ display: "flex", marginLeft: "auto", fontSize: TYPE.headSub, color: ink.inkFaint }}>촬영 안내</div>
      </div>
      <div style={{ display: "flex", marginTop: 44, fontFamily: "Serif", fontSize: 58, fontWeight: 600 }}>
        {sheet.label}
      </div>
      <div style={{ display: "flex", marginTop: 4, fontFamily: "Latin", fontSize: 40, color: ink.inkFaint }}>
        {sheet.en}
      </div>
      <div style={{ display: "flex", marginTop: 56 }}>
        {/* 세로선 — 항목들이 하나의 흐름으로 이어져 있음을 보여준다 */}
        <div style={{ display: "flex", width: 1, background: ink.line, marginLeft: 7, marginTop: 14 }} />
        <div style={{ display: "flex", flexDirection: "column", marginLeft: -8, gap: 44 }}>
          {sheet.cards.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 34 }}>
              <div
                style={{
                  display: "flex",
                  width: 15,
                  height: 15,
                  minWidth: 15,
                  borderRadius: 999,
                  background: ink.accent,
                  marginTop: 14,
                }}
              />
              <div style={{ display: "flex", width: 852, flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", fontSize: 38, fontWeight: 500 }}>{c.topic}</div>
                <div style={{ display: "flex", fontSize: TYPE.body, lineHeight: 1.65, color: ink.inkSoft }}>
                  {c.body.slice(0, MAX_BODY)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Footer ink={ink} />
    </Frame>
  );
}
const hFlow = (s: GuideSheet) =>
  348 + s.cards.reduce((a, c) => a + 50 + 12 + lines(c.body, perLine(852)) * 66 + 44, 0) + 190;

function TEnvelope({ sheet, name, ink, style, bgImage, dark }: Ctx & { dark: boolean }) {
  return (
    <Frame style={style} ink={ink} pad="60px 48px" bgImage={bgImage}>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        // 배경지 위에 얹은 종이 — 배경 질감이 테두리로만 보이게
        background: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.62)",
        border: `1px solid ${ink.line}`,
        padding: "76px 60px",
      }}
    >
      <div style={{ display: "flex", fontSize: TYPE.head, letterSpacing: 7, color: ink.inkFaint }}>{name}</div>
      <div style={{ display: "flex", marginTop: 40, fontFamily: "Latin", fontSize: 80 }}>{sheet.en}</div>
      <div style={{ display: "flex", marginTop: 8, fontFamily: "Serif", fontSize: 44, color: ink.inkSoft }}>
        {sheet.label}
      </div>
      <div style={{ display: "flex", marginTop: 40, width: 80, height: 1, background: ink.accent }} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: 44, gap: 38, width: "100%" }}>
        {sheet.cards.map((c) => (
          <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", fontSize: TYPE.label, fontWeight: 500, color: ink.inkFaint }}>{c.topic}</div>
            <div style={{ display: "flex", fontSize: TYPE.body, lineHeight: 1.65 }}>{c.body.slice(0, MAX_BODY)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: 56, fontFamily: "Latin", fontSize: TYPE.brand, color: ink.inkSoft }}>
        samae
      </div>
    </div>
    </Frame>
  );
}
const hEnvelope = (s: GuideSheet) =>
  420 + s.cards.reduce((a, c) => a + 42 + 8 + lines(c.body, perLine(830)) * 66 + 38, 0) + 250;

function TCover({ sheet, name, ink, style, bgImage }: Ctx) {
  return (
    <Frame style={style} ink={ink} pad="110px 84px" bgImage={bgImage}>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
      }}
    >
      <div style={{ display: "flex", fontSize: TYPE.head, letterSpacing: 10, color: ink.inkFaint }}>{name}</div>
      <div
        style={{ display: "flex", marginTop: 56, fontFamily: "Latin", fontSize: 112, lineHeight: 1.1, textAlign: "center" }}
      >
        {sheet.en}
      </div>
      <div style={{ display: "flex", marginTop: 14, fontFamily: "Serif", fontSize: 50, color: ink.inkSoft }}>
        {sheet.label}
      </div>
      <div style={{ display: "flex", marginTop: 56, width: 1, height: 72, background: ink.accent }} />
      {sheet.cards[0] && (
        <div
          style={{
            display: "flex",
            width: 830,
            marginTop: 56,
            fontSize: TYPE.body,
            lineHeight: 1.75,
            textAlign: "center",
            color: ink.inkSoft,
          }}
        >
          {sheet.cards[0].body.slice(0, MAX_BODY)}
        </div>
      )}
      <div style={{ display: "flex", marginTop: 88, fontFamily: "Latin", fontSize: TYPE.brand, color: ink.inkSoft }}>
        samae
      </div>
      <div style={{ display: "flex", marginTop: 6, fontSize: TYPE.foot, color: ink.inkFaint }}>
        상담은 사매 채팅으로
      </div>
    </div>
    </Frame>
  );
}

function heightOf(template: TemplateKey, sheet: GuideSheet): number {
  const h =
    template === "label"
      ? hLabel(sheet)
      : template === "letter"
        ? hLetter(sheet)
        : template === "ledger"
          ? hLedger(sheet)
          : template === "flow"
            ? hFlow(sheet)
            : template === "envelope"
              ? hEnvelope(sheet)
              : 1350; // 표지형은 고정 4:5
  return Math.max(MIN_HEIGHT, Math.round(h));
}

/** 안내 이미지 한 장을 굽는다. 미리보기와 발행이 같은 이 함수를 쓴다. */
export async function renderGuideCard(
  displayName: string,
  sheet: GuideSheet,
  style: GuideStyle,
  /** 높이를 직접 지정 — 재단(renderGuideCardFitted)에서만 쓴다 */
  heightOverride?: number
): Promise<ImageResponse> {
  const shown: GuideSheet = { ...sheet, cards: sheet.cards.slice(0, MAX_CARDS_PER_CARD) };
  const ink = inkOf(style);
  const dark = !style.backdropUrl && !!BACKDROPS.find((b) => b.key === style.backdrop)?.dark;
  const preset = BACKDROPS.find((b) => b.key === style.backdrop);
  // 작가가 올린 사진이 우선, 없으면 프리셋 질감, 그것도 없으면 CSS 배경
  const [fonts, bgImage] = await Promise.all([
    loadFonts(style.font),
    style.backdropUrl
      ? Promise.resolve(style.backdropUrl)
      : preset?.texture
        ? textureDataUri(preset.texture)
        : Promise.resolve(null),
  ]);
  const ctx: Ctx = { sheet: shown, name: displayName, ink, style, bgImage };

  const body =
    style.template === "letter" ? (
      <TLetter {...ctx} />
    ) : style.template === "ledger" ? (
      <TLedger {...ctx} />
    ) : style.template === "flow" ? (
      <TFlow {...ctx} />
    ) : style.template === "envelope" ? (
      <TEnvelope {...ctx} dark={dark} />
    ) : style.template === "cover" ? (
      <TCover {...ctx} />
    ) : (
      <TLabel {...ctx} />
    );

  return new ImageResponse(body, {
    width: WIDTH,
    height: heightOverride ?? heightOf(style.template, shown),
    fonts,
  });
}

/**
 * 한 번 굽고 **남는 여백을 재서 다시 굽는다.**
 *
 * 높이는 글자 수로 어림할 수밖에 없는데(Satori 는 레이아웃을 돌려주지 않는다), 어림은
 * 안전하게 잡아야 해서 늘 넉넉하다. 카드가 많은 장에서는 그 오차가 쌓여 본문과 푸터
 * 사이에 700px 넘는 빈 칸이 남았다 — 실측 3080px 짜리에서 768px.
 *
 * 재는 법: 글자가 하나도 없는 가로줄이 연달아 이어지는 구간을 찾는다. 카드 사이 간격은
 * 100px 안팎이라, 그보다 훨씬 긴 구간 하나가 곧 "쓸데없는 여백" 이다. 그만큼 줄여 다시 굽는다.
 *
 * 표지형은 건너뛴다 — 큰 제목 하나에 여백을 크게 두는 게 그 양식의 의도다.
 */
const GAP_KEEP = 96; // 재단 후 본문과 푸터 사이에 남길 간격 (카드 사이 간격과 같은 값)
const GAP_MIN = 200; // 이보다 작은 빈칸은 원래 그런 간격이라 건드리지 않는다

export async function renderGuideCardFitted(
  displayName: string,
  sheet: GuideSheet,
  style: GuideStyle
): Promise<{ png: Buffer; width: number; height: number }> {
  const first = await renderGuideCard(displayName, sheet, style);
  let png = Buffer.from(await first.arrayBuffer());
  const estimated = heightOf(style.template, {
    ...sheet,
    cards: sheet.cards.slice(0, MAX_CARDS_PER_CARD),
  });
  let height = estimated;

  if (style.template !== "cover") {
    const slack = await blankRun(png, WIDTH, estimated);
    const cut = slack - GAP_KEEP;
    if (slack >= GAP_MIN && estimated - cut >= MIN_HEIGHT) {
      height = estimated - cut;
      png = Buffer.from(await (await renderGuideCard(displayName, sheet, style, height)).arrayBuffer());
    }
  }
  return { png, width: WIDTH, height };
}

/** 글자가 없는 가로줄이 가장 길게 이어지는 구간의 길이 */
async function blankRun(png: Buffer, width: number, height: number): Promise<number> {
  const sharp = (await import("sharp")).default;
  const px = await sharp(png).greyscale().raw().toBuffer();
  let best = 0;
  let run = 0;
  for (let y = 0; y < height; y++) {
    let ink = 0;
    // 양끝 8px 은 뺀다 — 가장자리 안티앨리어싱 한 점 때문에 줄 전체가 "글자 있음" 이 된다
    for (let x = 8; x < width - 8; x++) {
      if (px[y * width + x] < 140 && ++ink > 2) break;
    }
    if (ink > 2) run = 0;
    else if (++run > best) best = run;
  }
  return best;
}

// 안내 이미지 양식 — 템플릿과 배경지 목록, 그리고 저장값 해석.
//
// 순수 데이터·로직만 둔다(렌더는 guide-card-template.tsx). 어드민 설정 화면과
// 렌더러가 **같은 목록**을 읽어야 고르는 것과 나오는 것이 어긋나지 않는다.

export type TemplateKey = "label" | "letter" | "ledger" | "flow" | "envelope" | "cover";
export type FontKey = "sans" | "gowun" | "myeongjo" | "batang" | "plex";
export type BackdropKey =
  | "cream"
  | "dawn"
  | "glow"
  | "ink"
  | "papyrus"
  | "linen"
  | "dune"
  | "glint";

export const TEMPLATES: { key: TemplateKey; label: string; hint: string }[] = [
  { key: "label", label: "라벨형", hint: "주제를 왼쪽에 세워 훑기 쉬움 · 기본값" },
  { key: "letter", label: "편지형", hint: "가운데 정렬에 여백이 넓음" },
  { key: "ledger", label: "장부형", hint: "번호와 얇은 선 · 대조해 읽기 좋음" },
  { key: "flow", label: "흐름형", hint: "세로선으로 이어짐 · 순서가 있는 내용" },
  { key: "envelope", label: "봉투형", hint: "배경 위에 종이 한 장 · 사진 배경과 잘 맞음" },
  { key: "cover", label: "표지형", hint: "큰 제목과 한 문장 · 세트의 첫 장용" },
];

/**
 * 글씨체. 본문·제목·영문을 한 묶음으로 고른다 — 셋을 따로 고르게 하면 조합이
 * 수십 가지가 되고, 대부분은 안 어울린다. 실제 파일 목록은 guide-card-template.tsx.
 *
 * 전부 OFL(구글폰트) 이라 상업적으로 써도 된다.
 */
export const FONTS: { key: FontKey; label: string; hint: string }[] = [
  { key: "sans", label: "고딕", hint: "노토 산스 · 작게 줄여도 또렷함 · 기본값" },
  { key: "gowun", label: "고운", hint: "고운돋움 · 획이 얇고 부드러움" },
  { key: "myeongjo", label: "명조", hint: "나눔명조 · 인쇄물 같은 결" },
  { key: "batang", label: "바탕", hint: "노토 세리프 · 묵직한 명조" },
  { key: "plex", label: "플렉스", hint: "IBM Plex · 각진 현대 고딕" },
];

/**
 * 배경지. `dark` 인 배경은 글자색이 통째로 반전된다.
 *
 * **글자가 읽히는 것이 배경의 첫 번째 조건이다.** 질감·사진 배경은 만들 때
 * 가장 어두운 픽셀을 끌어올려 본문 글자와 4.5:1(WCAG 본문 기준) 이상을 보장한다
 * — scripts/guide-bg-readable.mjs. 그 검사를 통과하지 못하면 목록에 넣지 않는다.
 *
 * 수를 여덟로 줄인 이유: 고르기 어려우면 오히려 안 쓴다. 비슷한 것(종이 계열 셋,
 * 모래 계열 둘)은 제일 나은 하나만 남겼다.
 */
export const BACKDROPS: {
  key: BackdropKey;
  label: string;
  /** CSS 배경. 질감·사진형(texture 가 있는 것)은 고르는 칩의 미리보기용 */
  background: string;
  /** public/guide-bg 아래 파일명 — 있으면 그림을 깔고 CSS 배경은 쓰지 않는다 */
  texture?: string;
  dark?: boolean;
}[] = [
  // ── 단색·그라데이션
  { key: "cream", label: "크림", background: "#faf7f2" },
  { key: "dawn", label: "새벽", background: "linear-gradient(165deg, #f6f3ed 0%, #ece7df 55%, #ddd6cb 100%)" },
  {
    key: "glow",
    label: "노을빛",
    background: "radial-gradient(130% 90% at 25% 15%, #fbf1e4 0%, #f0dcc7 45%, #e0c4a9 100%)",
  },
  {
    key: "ink",
    label: "먹",
    background: "radial-gradient(120% 90% at 30% 10%, #35302b 0%, #232019 55%, #17150f 100%)",
    dark: true,
  },
  // ── 질감·사진 (CC0 — public/guide-bg/CREDITS.md)
  { key: "papyrus", label: "종이", texture: "papyrus.jpg", background: "linear-gradient(165deg, #f6f1e5 0%, #e7dfcd 100%)" },
  { key: "linen", label: "리넨", texture: "linen.jpg", background: "linear-gradient(170deg, #f5f2ea 0%, #e6e0d2 100%)" },
  { key: "dune", label: "모래결", texture: "dune.jpg", background: "linear-gradient(165deg, #efe6d8 0%, #ddd0bd 100%)" },
  { key: "glint", label: "윤슬", texture: "glint.jpg", background: "linear-gradient(165deg, #f8f7f4 0%, #e6e5e1 100%)" },
];

/**
 * 밝은 배경용 글자색.
 *
 * 회색 단계를 전부 진하게 잡았다 — 이전 값(inkFaint #9a9289, 밝기 154)은 질감 배경
 * 위에서 배경과 거의 같은 밝기라 헤더·푸터가 통째로 묻혔다. 지금은 가장 옅은 글자도
 * 배경(최소 190)과 4.5:1 을 넘는다. `accent` 는 **장식(점·선) 전용**이다 —
 * 글자에 쓰면 그 순간 기준을 못 넘는다.
 */
export const LIGHT_INK = {
  ink: "#1c1a17",
  inkSoft: "#3f3a33",
  inkFaint: "#4b463f",
  line: "#cdc5b8",
  accent: "#9c9182",
};
export const DARK_INK = {
  ink: "#f4f1ea",
  inkSoft: "#ddd6cb",
  inkFaint: "#c2bab0",
  line: "#4b443c",
  accent: "#a89e92",
};

/**
 * 작가가 올린 사진 위에 까는 종이 한 겹.
 *
 * 사진 위에 글자를 바로 얹으면 **작가가 어떤 사진을 올리든 읽힌다고 보장할 수 없다.**
 * 밝은 사진이면 글자가 날아가고 어두우면 뭉갠다. 그래서 반투명 크림을 덮어 대비를
 * 확보한다 — 사진의 색과 분위기는 남고 글은 읽힌다.
 */
export const UPLOAD_VEIL = "rgba(250, 247, 242, 0.88)";

export type GuideStyle = {
  template: TemplateKey;
  backdrop: BackdropKey;
  font: FontKey;
  /** 작가가 올린 배경 사진. 있으면 프리셋 대신 이것을 깐다. */
  backdropUrl: string | null;
};

export const DEFAULT_GUIDE_STYLE: GuideStyle = {
  template: "label",
  backdrop: "cream",
  // 안내물은 멋보다 읽힘이 먼저다. 명조·고운체는 폰에서 400px 로 줄면 얇은 획이
  // 먼저 뭉개진다 — 고르는 건 자유지만 기본은 가장 안전한 쪽으로 둔다.
  font: "sans",
  backdropUrl: null,
};

/**
 * DB 의 jsonb 를 읽어 쓸 수 있는 값으로 만든다.
 * 모르는 값(삭제된 템플릿, 오타)은 조용히 기본값으로 떨어뜨린다 — 설정 하나 때문에
 * 안내 이미지 전체가 안 나오는 쪽이 더 나쁘다.
 */
export function resolveGuideStyle(raw: unknown): GuideStyle {
  const v = (raw ?? {}) as Partial<Record<keyof GuideStyle, unknown>>;
  const template = TEMPLATES.some((t) => t.key === v.template)
    ? (v.template as TemplateKey)
    : DEFAULT_GUIDE_STYLE.template;
  const backdrop = BACKDROPS.some((b) => b.key === v.backdrop)
    ? (v.backdrop as BackdropKey)
    : DEFAULT_GUIDE_STYLE.backdrop;
  const font = FONTS.some((f) => f.key === v.font)
    ? (v.font as FontKey)
    : DEFAULT_GUIDE_STYLE.font;
  const url = typeof v.backdropUrl === "string" && v.backdropUrl.trim() ? v.backdropUrl.trim() : null;
  return { template, backdrop, font, backdropUrl: url };
}

/** 이 설정으로 그릴 때의 색 묶음 — 업로드 배경은 종이를 덮으므로 늘 밝은 쪽이다 */
export function inkOf(style: GuideStyle) {
  if (style.backdropUrl) return LIGHT_INK;
  return BACKDROPS.find((b) => b.key === style.backdrop)?.dark ? DARK_INK : LIGHT_INK;
}

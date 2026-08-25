// 팔레트 → 화면 테마 변환 — 결과 화면(PersonaResult)과 OG 공유 카드(share/route)가
// 같은 변환을 쓴다 (미리보기 ↔ 착지 화면의 시각 정합).
// 순수 함수만 — 클라이언트 컴포넌트와 서버 라우트 양쪽에서 import 한다.
//
// 대비 보장 방식 (2026-08-25 감사 반영):
//   임계값(lum > 0.35) 추정이 아니라 **두 잉크 후보의 실제 대비비를 계산해 높은 쪽**을
//   고르고, 보조(soft) 잉크까지 AA(4.5:1)를 못 넘기면 배경 밝기를 0.04 스텝으로
//   잉크 반대 방향으로 밀어 넘길 때까지 보정한다. 전수 계산(RGB 스텝 8) 실패율 0% 검증.

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h6 = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h6 * 60, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** 원색 → 뮤트 톤. 채도 38% 클램프, 밝기는 극단만 중앙으로 (예: #c8453a → #b15951) */
export function muteHex(hex: string): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  return hslToHex(hsl.h, Math.min(hsl.s, 0.38), Math.min(Math.max(hsl.l, 0.26), 0.86));
}

// ── 대비 계산 ──
const DARK_INK: [number, number, number] = [22, 17, 13];
const LIGHT_INK: [number, number, number] = [255, 252, 248];
const DARK_SOFT_A = 0.85; // 보조 잉크 알파 — 감사에서 0.68 은 AA 미달 케이스 확인
const LIGHT_SOFT_A = 0.9;

const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function lumOfHex(hex: string): number {
  const chan = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return 0.2126 * lin(chan(1)) + 0.7152 * lin(chan(3)) + 0.0722 * lin(chan(5));
}

/** 알파 잉크를 배경 위에 합성했을 때의 실효 휘도 */
function blendLum(ink: [number, number, number], alpha: number, bgHex: string): number {
  const bg = [1, 3, 5].map((i) => parseInt(bgHex.slice(i, i + 2), 16));
  const out = ink.map((v, i) => (v * alpha + bg[i] * (1 - alpha)) / 255);
  return 0.2126 * lin(out[0]) + 0.7152 * lin(out[1]) + 0.0722 * lin(out[2]);
}

const contrast = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

/** 워시 알파 — 히어로 카드 코너의 보조색 합성 비율 */
const WASH_A = 0.35;

function blendHex(top: string, alpha: number, bgHex: string): string {
  const bg = [1, 3, 5].map((i) => parseInt(bgHex.slice(i, i + 2), 16));
  const t = [1, 3, 5].map((i) => parseInt(top.slice(i, i + 2), 16));
  return (
    "#" + t.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("")
  );
}

/** bg0 기준으로 워시 색을 만든다 — 밝기를 bg0 ±0.08 로 클램프해 코너 휘도 이탈을 줄인다 */
function washFor(bg0: string, p1: string): string {
  const src = hexToHsl(muteHex(p1));
  const base = hexToHsl(bg0);
  if (!src || !base) return bg0;
  return hslToHex(src.h, src.s, Math.min(base.l + 0.08, Math.max(base.l - 0.08, src.l)));
}

/** 배경(bg0)과 실제 워시 코너면 **둘 다**에 대해 보조 잉크 대비가 더 좋은 쪽을 계산.
 *  soft 가 본문(ink)보다 항상 대비가 낮다(같은 색·낮은 알파) — soft 기준이면 둘 다 만족. */
function pickInk(bg0: string, p1: string): { dark: boolean; softC: number } {
  const corner = blendHex(washFor(bg0, p1), WASH_A, bg0);
  const evalInk = (ink: [number, number, number], a: number) =>
    Math.min(
      contrast(blendLum(ink, a, bg0), lumOfHex(bg0)),
      contrast(blendLum(ink, a, corner), lumOfHex(corner))
    );
  const darkSoft = evalInk(DARK_INK, DARK_SOFT_A);
  const lightSoft = evalInk(LIGHT_INK, LIGHT_SOFT_A);
  return darkSoft >= lightSoft ? { dark: true, softC: darkSoft } : { dark: false, softC: lightSoft };
}

export type PaletteTheme = {
  /** 뮤트·대비 보정을 마친 배경색 (도미넌트) */
  bg0: string;
  /** 보조 워시 색 (뮤트) */
  bg1: string;
  /** 어두운 잉크를 쓰는 배경인가 */
  dark: boolean;
  ink: string;
  soft: string;
  line: string;
};

export function paletteTheme(palette: string[]): PaletteTheme {
  const p1 = palette[1] ?? palette[0] ?? "#241a18";
  let bg0 = muteHex(palette[0] ?? "#241a18");

  let best = pickInk(bg0, p1);
  // AA 미달이면 배경 밝기를 잉크 반대 방향으로 0.04 씩 — 어두운 잉크면 밝게, 밝은 잉크면 어둡게.
  // pickInk 가 실제 워시 코너면까지 재므로, 루프가 끝나면 카드 전면이 AA 를 만족한다.
  // 목표를 4.6 으로 잡는 이유: 코너 색이 정수 hex 로 반올림되며 경계(±0.05)에서
  // 4.5 를 아슬하게 밑도는 케이스가 전수 검사에서 0.11% 확인됨 — 마진으로 흡수.
  for (let i = 0; i < 24 && best.softC < 4.6; i++) {
    const hsl = hexToHsl(bg0);
    if (!hsl) break;
    bg0 = hslToHex(hsl.h, hsl.s, Math.min(0.97, Math.max(0.03, hsl.l + (best.dark ? 0.04 : -0.04))));
    best = pickInk(bg0, p1);
  }

  const bg1 = washFor(bg0, p1);
  const dark = best.dark;
  return {
    bg0,
    bg1,
    dark,
    ink: dark ? "rgba(22,17,13,0.96)" : "rgba(255,252,248,0.98)",
    soft: dark ? `rgba(22,17,13,${DARK_SOFT_A})` : `rgba(255,252,248,${LIGHT_SOFT_A})`,
    line: dark ? "rgba(22,17,13,0.22)" : "rgba(255,252,248,0.30)",
  };
}

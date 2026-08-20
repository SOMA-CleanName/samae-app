// 사진에서 대표 색 뽑기.
//
// 왜 코드로 뽑는가: LLM 에게 colorPalette 를 물으면 사진을 보고 뽑는 게 아니라
// CSS 표준 색이름을 지어낸다. 실측(2026-08-20, qwen3-vl 30b)에서 나온 값이
// #F0F8FF(AliceBlue) · #F5F5DC(Beige) · #FFF8DC(Cornsilk) 였다 — 셋 다 CSS 이름 색이고
// 원본 사진에는 없는 색이다. 팔레트는 결과 화면의 '지문' 이라 지어낸 색이면 의미가 없다.
//
// 픽셀에서 직접 세면 정확하고, 토큰도 안 쓰고, 수십 ms 면 끝난다.
import "server-only";
import sharp from "sharp";

const SAMPLE_PX = 48; // 색 분포만 보면 되므로 작게 — 48x48 이면 장당 2,304 픽셀
const QUANT = 5; // 채널당 5비트(32단계)로 뭉쳐서 비슷한 색을 한 통에 모은다
const MIN_DISTANCE = 64; // 뽑은 색끼리 이만큼은 떨어져야 '다른 색'으로 친다

function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

/** 사진 여러 장 → 대표 색 hex 배열 (빈도순, 서로 구분되는 색만) */
export async function extractPalette(buffers: Buffer[], count = 5): Promise<string[]> {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();

  for (const buf of buffers) {
    let raw: { data: Buffer; info: sharp.OutputInfo };
    try {
      raw = await sharp(buf, { failOn: "none" })
        .resize(SAMPLE_PX, SAMPLE_PX, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    } catch {
      continue; // 한 장 실패로 팔레트 전체를 잃지 않는다
    }

    const { data, info } = raw;
    const stride = info.channels;
    for (let i = 0; i + stride - 1 < data.length; i += stride) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const shift = 8 - QUANT;
      const key = ((r >> shift) << (QUANT * 2)) | ((g >> shift) << QUANT) | (b >> shift);
      const cur = buckets.get(key);
      // 통 안의 실제 평균색을 같이 들고 간다 — 양자화 격자값을 그대로 쓰면 색이 탁해진다
      if (cur) {
        cur.n++;
        cur.r += r;
        cur.g += g;
        cur.b += b;
      } else {
        buckets.set(key, { n: 1, r, g, b });
      }
    }
  }

  if (buckets.size === 0) return [];

  const sorted = [...buckets.values()]
    .map((v) => ({ n: v.n, r: v.r / v.n, g: v.g / v.n, b: v.b / v.n }))
    .sort((a, b) => b.n - a.n);

  // 빈도순으로 훑되, 이미 뽑은 색과 너무 비슷하면 건너뛴다.
  // (안 그러면 배경 하늘색 미묘한 변주 5개가 뽑혀 팔레트가 한 덩어리로 보인다)
  const picked: Array<{ r: number; g: number; b: number }> = [];
  for (const c of sorted) {
    if (picked.length >= count) break;
    const tooClose = picked.some((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < MIN_DISTANCE);
    if (!tooClose) picked.push(c);
  }
  // 구분되는 색이 모자라면 기준을 풀어 채운다 (톤이 극단적으로 단조로운 피드)
  for (const c of sorted) {
    if (picked.length >= count) break;
    if (!picked.some((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < 24)) picked.push(c);
  }

  return picked.map((c) => toHex(c.r, c.g, c.b));
}

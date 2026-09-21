// 배경 가독성 보정 — 안내 이미지 배경이 지켜야 할 최소 조건.
//
// 배경은 보이라고 있는 게 아니라 글을 받쳐주는 것이다. 아무리 예뻐도 어두운 자리에
// 글자가 걸리면 못 읽는다. 그래서 만들 때 **가장 어두운 픽셀**을 기준선 위로 끌어올린다.
//
// 기준: **가장 옅은 글자**(헤더·푸터)와의 명도대비 4.5:1 — WCAG 본문 기준.
//
// 처음엔 본문(#1c1a17, 밝기 28)만 기준으로 145 를 잡았는데, 실제로 안 읽힌 건 본문이
// 아니라 회색 헤더·푸터였다. 가장 어두운 글자로 잰 탓에 가장 옅은 글자를 놓쳤다.
// 지금은 가장 옅은 글자(밝기 75)를 기준으로 역산해 190 을 목표로 한다.
// 질감의 굴곡은 그만큼 줄지만, 배경에서 잃는 대비보다 못 읽는 글자가 훨씬 비싸다.

import sharp from "sharp";

export const TARGET_MIN = 190;
export const TARGET_MAX = 250;

/** 가장 어두운 곳을 TARGET_MIN 위로 올린다. 이미 밝으면 그대로 둔다. */
export async function ensureReadable(buf) {
  const { channels } = await sharp(buf).greyscale().stats();
  const min = channels[0].min;
  if (min >= TARGET_MIN) return buf;
  // [min,255] → [TARGET_MIN,TARGET_MAX] 로 눌러 담는다
  const a = (TARGET_MAX - TARGET_MIN) / (255 - min);
  const b = TARGET_MIN - a * min;
  return sharp(buf).linear(a, b).toBuffer();
}

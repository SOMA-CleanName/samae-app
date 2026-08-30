// 작가 KB 카드 — 파일 기반 데모.
//
// photographer-scripts.ts 와 같은 단계다: 여기서 형태를 확정한 뒤
// photographer_bot_kb (jsonb doc) 테이블로 이관하고, 이 파일은 폴백만 남긴다.
// 카드 문구는 작가가 준 정책 문서를 운영이 옮겨 적은 것 (source: "운영 확인").

import type { KbCard, PhotographerKb } from "./bot-kb";

const HYUN_CARDS: KbCard[] = [
  {
    id: "pkg-solo",
    topic: "가격",
    body: "1인 스냅은 9만원입니다. 촬영 1시간, 보정본 15장을 드리고 원본은 제공하지 않습니다.",
  },
  {
    id: "pkg-couple",
    topic: "가격",
    body: "커플·우정 스냅은 15만원입니다. 촬영 1시간, 보정본 15장을 드리고 원본은 제공하지 않습니다.",
  },
  {
    id: "pkg-wedding",
    topic: "가격",
    body: "웨딩 스냅은 22만원입니다. 촬영 1시간 30분, 보정본 15장을 드리고 원본도 제공합니다.",
  },
  {
    id: "pkg-graduation",
    topic: "가격",
    body: "졸업 스냅은 1인 기준 12만원, 2인 기준 18만원입니다. 촬영 1시간, 보정본 15장을 드리고 원본도 제공합니다.",
  },
  {
    id: "orig-policy",
    topic: "원본",
    body: "원본 제공 여부는 촬영 종류에 따라 다릅니다. 웨딩 스냅과 졸업 스냅은 원본을 제공하고, 1인 스냅과 커플·우정 스냅은 원본을 제공하지 않습니다.",
  },
  {
    id: "sns-bonus",
    topic: "보정",
    body: "마케팅(SNS) 활용에 동의해주시면 모든 촬영에 서비스로 보정본 2장 이상을 추가로 드립니다. 동의하지 않으시면 사진은 업로드하지 않습니다.",
  },
  {
    id: "blog-review",
    topic: "보정",
    body: "네이버 블로그 리뷰를 작성해주시면 서비스로 보정본 1장을 추가로 드립니다.",
  },
  {
    id: "retouch-time",
    topic: "보정",
    body: "보정본은 촬영일 기준 7일 내로 전달드리며, 작업 상황에 따라 2~3일 정도 늦어질 수 있습니다.",
  },
  {
    id: "retouch-style",
    topic: "보정",
    body: "자연스러움을 추구하기 때문에 과한 얼굴 보정은 지양하고 있습니다.",
  },
  {
    id: "retouch-revision",
    topic: "보정",
    body: "보정본 수정은 기본적으로 1회까지 진행해드립니다.",
  },
  {
    id: "styling",
    topic: "준비물",
    body: "의상과 소품은 촬영 예약이 확정된 이후 촬영 전날까지, 원하시는 느낌이나 촬영 장소에 맞게 소통하면서 함께 정해드립니다.",
  },
  {
    id: "hair-makeup",
    topic: "준비물",
    body: "헤어·메이크업은 요청하시면 제휴 할인가로 헤메샵을 안내해드립니다.",
  },
  {
    id: "discount-repeat",
    topic: "가격",
    body: "재문의 주시는 분들께는 10% 할인가로 도와드리고 있습니다.",
  },
  {
    id: "weather",
    topic: "일정변경",
    body: "촬영날 날씨가 너무 안 좋을 경우(천재지변, 폭설, 폭우 등) 다른 날짜로 변경 가능합니다.",
  },
  {
    // 환불은 작가별 사실이 아니라 사매 공통 규정이다 — 카드가 전역 정책과 어긋나면
    // 봇이 서로 다른 말을 한다. 여기서는 규정을 요약만 하고 판단은 넘기지 않는다. (docs/32)
    id: "refund",
    topic: "환불",
    body:
      "결제 후 7일 이내면 전액 환불됩니다. 그 뒤로는 촬영 7일 전까지 취소 시 " +
      "결제 금액의 50%가 위약금으로 부과되고, 촬영 7일 이내에는 환불이 어렵습니다.",
  },
];

// 작가 id → KB (DB 이관 전 데모)
const KB_BY_PHOTOGRAPHER: Record<string, KbCard[]> = {
  // Hyun (테스트 작가)
  "b2bffb8a-3271-4093-a113-35b525ed80e7": HYUN_CARDS,
};

/** 이 작가에게 등록된 KB — 없으면 null (봇은 기존 수집 모드로 동작) */
export function getPhotographerKb(
  photographerId: string,
  displayName: string
): PhotographerKb | null {
  const cards = KB_BY_PHOTOGRAPHER[photographerId];
  if (!cards || cards.length === 0) return null;
  return { photographerId, displayName, cards };
}

export function hasKb(photographerId: string): boolean {
  return (KB_BY_PHOTOGRAPHER[photographerId]?.length ?? 0) > 0;
}

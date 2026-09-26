// 작가 지식카드(KB)를 **주제별 묶음**으로 — 안내 이미지와 공개 지면이 같은 묶음을 쓴다.
//
// 이 매핑이 두 곳에서 쓰인다:
//   · `guide-card-template` — 카드를 **이미지로 굽는다**(채팅에서 보여주는 안내 시트)
//   · 작가 공개 지면 — 같은 내용을 **글로** 싣는다
//
// 🔴 **글과 이미지가 다른 묶음을 쓰면 안 된다.** 같은 작가의 「가격·구성」이 이미지와
//    글에서 다른 내용을 담고 있으면, 어느 쪽이 맞는지 아무도 답할 수 없다. 그래서
//    매핑을 여기 한 곳에 두고 양쪽이 가져다 쓴다.
//
// 이미지 쪽에는 **장수 쪼개기**(가격·구성 (1/2), (2/2))가 더 붙는다. 그건 한 장에 들어갈
// 줄 수가 정해져 있어서 생기는 일이라 글에는 해당이 없다 — 글은 길어도 그냥 이어진다.

import type { KbCard } from "./bot-kb";

/** 주제 → 묶음. 여기 없는 주제는 「그 외 안내」로 모인다 */
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

export type KbSection = { label: string; en: string; cards: KbCard[] };

/**
 * 카드를 주제 묶음으로 나눈다. **빈 묶음은 내보내지 않는다** — 제목만 있고 내용이 없는
 * 칸을 지면에 세우면 "준비 중" 으로 읽힌다.
 *
 * 이미지 쪽(`groupCardsIntoSheets`)과 달리 장수로 쪼개지 않는다.
 */
export function groupKbIntoSections(cards: readonly KbCard[] | null | undefined): KbSection[] {
  const list = cards ?? [];
  if (list.length === 0) return [];

  const claimed = new Set(GUIDE_SHEETS.flatMap((s) => s.topics));
  const sections: KbSection[] = GUIDE_SHEETS.map((s) => ({
    label: s.label,
    en: s.en,
    cards: list.filter((c) => s.topics.includes(c.topic)),
  })).filter((s) => s.cards.length > 0);

  // 우리가 아직 분류하지 않은 주제 — 버리지 않는다. 작가가 쓴 답이라 빠지면 손해다.
  const rest = list.filter((c) => !claimed.has(c.topic));
  if (rest.length > 0) sections.push({ label: "그 외 안내", en: "More", cards: rest });

  return sections;
}

/**
 * 구조화 데이터(FAQPage)용 문답 쌍.
 *
 * 카드에는 "질문" 이 따로 없다. `topic` 이 곧 무엇에 대한 답인지를 말하므로 그걸
 * 질문으로 세운다 — "가격은 어떻게 되나요?" 처럼 우리가 질문을 **지어내지 않는다.**
 * 지어낸 질문은 작가가 답한 적 없는 질문이 되고, 그게 검색 결과에 작가 이름으로 뜬다.
 */
export function kbFaqPairs(
  sections: readonly KbSection[],
  photographerName: string | null | undefined
): Array<{ question: string; answer: string }> {
  const who = (photographerName ?? "").trim();
  return sections
    .map((s) => ({
      question: who ? `${who} — ${s.label}` : s.label,
      answer: s.cards.map((c) => c.body.trim()).filter(Boolean).join("\n\n"),
    }))
    .filter((x) => x.answer.length > 0);
}

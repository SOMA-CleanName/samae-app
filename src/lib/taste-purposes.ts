// 취향 테스트 1단계 — 촬영 목적(고정 목록). 탐색 카테고리가 아님(슬러그·탐색 탭 노출 없음).
// 각 목적은 '어떤 사진을 보여주고 개인화할지'를 위해 내부적으로 탐색 카테고리(슬러그)를
// 참조한다. (사용자에겐 목적 3개만 보이고, 아래 슬러그 매핑은 노출되지 않음)
// 슬러그 목록은 운영 상황에 맞게 조정 가능 — 여기 배열만 고치면 됨.

export type PurposeOption = {
  key: string;
  label: string;
  subtext: string;
  categorySlugs: string[]; // 이 목적으로 볼 사진의 출처(탐색 카테고리 슬러그)
};

export const PURPOSE_OPTIONS: PurposeOption[] = [
  {
    key: "wedding",
    label: "웨딩 스냅",
    subtext: "평생 단 한 번의 순간, 가장 아름답게 남기고 싶어요",
    categorySlugs: [
      "wedding",
      "studio-wedding",
      "outdoor-wedding",
      "casual-wedding",
      "wedding-ceremony",
      "self-wedding",
      "dress",
    ],
  },
  {
    key: "couple",
    label: "커플 스냅",
    subtext: "지금의 우리를, 이 시절 그대로 담고 싶어요",
    categorySlugs: ["couple", "date", "friends"],
  },
  {
    key: "personal",
    label: "개인 스냅",
    subtext: "내가 원하는 무드로, 나를 화보처럼 담고 싶어요",
    categorySlugs: ["profile", "profile-image", "graduation", "school-uniform", "hanbok"],
  },
];

export function purposeByKey(key: string): PurposeOption | undefined {
  return PURPOSE_OPTIONS.find((p) => p.key === key);
}

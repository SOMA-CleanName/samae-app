// 취향 테스트 1단계 — 촬영 목적(고정 목록). 탐색 카테고리가 아님(슬러그·탐색 탭 노출 없음).
// 각 목적은 '어떤 사진을 보여주고 개인화할지'를 위해 내부적으로 탐색 카테고리(슬러그)를
// 참조한다. (사용자에겐 목적 3개만 보이고, 아래 슬러그 매핑은 노출되지 않음)
// 슬러그 목록은 운영 상황에 맞게 조정 가능 — 여기 배열만 고치면 됨.

export type PurposeOption = {
  key: string;
  label: string;
  subtext: string;
  categorySlugs: string[]; // 이 목적으로 볼 사진의 출처(탐색 카테고리 슬러그)
  boostWeight: number; // 홈 개인화 부스트 세기(클수록 그 목적 사진이 강하게 앞으로)
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
    boostWeight: 0.35, // 약하게 — 커플과 섞여도 OK
  },
  {
    key: "couple",
    label: "커플 스냅",
    subtext: "지금의 우리를, 이 시절 그대로 담고 싶어요",
    categorySlugs: ["couple", "date", "friends"],
    boostWeight: 0.35, // 약하게 — 웨딩과 섞여도 OK
  },
  {
    key: "personal",
    label: "개인 스냅",
    subtext: "내가 원하는 무드로, 나를 화보처럼 담고 싶어요",
    categorySlugs: ["profile", "profile-image", "graduation", "school-uniform", "hanbok"],
    boostWeight: 0.9, // 강하게 — 개인 사진이 확실히 앞으로, 웨딩/커플 밀림
  },
];

// 목적별 부스트 세기 — 없으면 기본 0.35.
export function purposeBoostWeight(key: string): number {
  return purposeByKey(key)?.boostWeight ?? 0.35;
}

export function purposeByKey(key: string): PurposeOption | undefined {
  return PURPOSE_OPTIONS.find((p) => p.key === key);
}

// 목적별 대표 사진 폴백 순서 — 그 목적 대표가 없으면 이 순서로 다른 목적 대표를 가져온다.
// (커플↔웨딩 우선 공유: 커플 없으면 웨딩, 웨딩 없으면 커플)
const COVER_FALLBACK: Record<string, string[]> = {
  wedding: ["wedding", "couple", "personal"],
  couple: ["couple", "wedding", "personal"],
  personal: ["personal", "wedding", "couple"],
};

// coverByPurpose 맵에서 이 목적의 대표 사진 id 를 폴백까지 고려해 해석.
export function resolveCoverForPurpose(
  coverByPurpose: Record<string, string>,
  purposeKey: string
): string | undefined {
  const order = COVER_FALLBACK[purposeKey] ?? [purposeKey];
  for (const k of order) if (coverByPurpose[k]) return coverByPurpose[k];
  return Object.values(coverByPurpose).find(Boolean); // 마지막 폴백 — 아무 목적 대표
}

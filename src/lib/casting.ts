// 캐스팅(무료 모델 모집) 공용 상수·순수 헬퍼.
// 서버·클라이언트 양쪽에서 쓰므로 server-only 를 붙이지 않는다. DB 접근은 여기 두지 않는다.
// 설계: docs/29-model-casting-funnel.md

/** 접수 하한 — 만 15세 미만은 근로기준법 §64(취직인허증) 이슈로 받지 않는다. */
export const MIN_AGE = 15;
/** 이 나이 미만은 보호자 동의가 필요한 미성년. */
export const ADULT_AGE = 19;

/**
 * 희망 사진 선택 개수 — 1장 필수, 최대 3장.
 * 작가 이름이 아니라 사진을 고르게 한다. 사람은 이름이 아니라 이미지로 취향을 판단하고,
 * 고른 사진 자체가 탈락 통지에서 되돌려 보여줄 수 있는 가장 강한 전환 소재가 된다.
 */
export const PICK_MIN = 1;
export const PICK_MAX = 3;

/**
 * 그리드 앞부분에서 작가를 몇 장씩 번갈아 낼지.
 * 사진은 전부 보여주되(개수 제한 없음), 앞쪽에서만 라운드로빈으로 섞는다 —
 * 최신순 그대로 두면 사진이 600장인 작가가 첫 화면을 독점해 나머지 작가가 안 보인다.
 */
export const PICK_INTERLEAVE_CHUNK = 4;

/** 신청자 사진 장수. */
export const PHOTO_MIN = 1;
export const PHOTO_MAX = 3;

export const CASTING_BUCKET = "samae-casting";

/**
 * 희망 무드 선택지 — 서비스에 실제로 쌓여 있는 상위 태그에서 가을 스냅에 맞는 것만 골랐다.
 * 자유 입력이 아니라 고정 목록인 이유: 어드민이 작가 배정할 때 비교 가능한 값이어야 하고,
 * 신청자가 서비스의 무드 어휘를 자연스럽게 학습하게 하려는 목적도 있다.
 */
export const CASTING_MOODS = [
  "감성",
  "빈티지",
  "내추럴",
  "필름",
  "화보",
  "패션",
  "몽환",
  "청순",
  "일본감성",
  "핀터레스트",
] as const;

export type CastingRound = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "open" | "closed" | "selecting" | "done";
  opensAt: string | null;
  closesAt: string | null;
  shootFrom: string | null;
  shootTo: string | null;
  capacity: number | null;
  description: string | null;
};

export type CastingPhotographer = {
  id: string;
  displayName: string;
  regions: string[];
  moodTags: string[];
  coverUrl: string | null;
};

/** STEP 2 선택지 — 참여 작가들의 실제 포트폴리오 사진. width/height 는 메이슨리 비율 계산용. */
export type CastingPickPhoto = {
  id: string;
  url: string;
  width: number;
  height: number;
  photographerId: string;
  photographerName: string;
};

/**
 * 작가별로 사진을 번갈아 섞는다. **한 장도 버리지 않는다** — 전부 볼 수 있어야 하므로
 * 개수를 자르지 않고 순서만 바꾼다.
 *
 * 사진이 적은 작가는 먼저 소진되는데, 그때부터는 남은 작가들끼리 계속 번갈아 낸다.
 * 결과적으로 앞쪽은 고르게 섞이고 뒤쪽은 사진 많은 작가로 자연스럽게 채워진다.
 */
export function interleaveByPhotographer(
  photos: CastingPickPhoto[],
  chunk = PICK_INTERLEAVE_CHUNK,
): CastingPickPhoto[] {
  const buckets = new Map<string, CastingPickPhoto[]>();
  for (const p of photos) {
    const list = buckets.get(p.photographerId);
    if (list) list.push(p);
    else buckets.set(p.photographerId, [p]);
  }

  const lists = [...buckets.values()];
  const cursors = new Array<number>(lists.length).fill(0);
  const out: CastingPickPhoto[] = [];

  while (out.length < photos.length) {
    let moved = false;
    for (let i = 0; i < lists.length; i += 1) {
      const list = lists[i];
      const end = Math.min(cursors[i] + chunk, list.length);
      for (let j = cursors[i]; j < end; j += 1) out.push(list[j]);
      if (end > cursors[i]) moved = true;
      cursors[i] = end;
    }
    if (!moved) break; // 방어 — 모든 버킷이 비면 종료
  }
  return out;
}

/**
 * 만 나이. 신청 시점 나이를 저장하지 않고 필요할 때마다 계산한다
 * (촬영일에 생일이 지나 성년이 되는 경우가 있어서).
 * DB 쪽 판정은 public.age_years() 가 하며, 이 함수는 폼 분기·표시용이다.
 */
export function ageYears(birth: string | Date, at: Date = new Date()): number | null {
  const b = typeof birth === "string" ? new Date(birth) : birth;
  if (Number.isNaN(b.getTime())) return null;
  let age = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age -= 1;
  return age;
}

export type AgeGate =
  | { kind: "invalid" }
  | { kind: "too_young"; age: number }
  | { kind: "minor"; age: number }
  | { kind: "adult"; age: number };

/** 생년월일 하나로 폼 분기를 결정한다. 서버 액션과 폼이 같은 판정을 쓰도록 여기 모아둔다. */
export function ageGate(birth: string, at: Date = new Date()): AgeGate {
  const age = ageYears(birth, at);
  if (age === null || age < 0 || age > 120) return { kind: "invalid" };
  if (age < MIN_AGE) return { kind: "too_young", age };
  if (age < ADULT_AGE) return { kind: "minor", age };
  return { kind: "adult", age };
}

/** 회차가 지금 신청을 받는 상태인지. */
export function isAcceptingNow(round: Pick<CastingRound, "status" | "opensAt" | "closesAt">, at = new Date()): boolean {
  if (round.status !== "open") return false;
  if (round.opensAt && new Date(round.opensAt) > at) return false;
  if (round.closesAt && new Date(round.closesAt) < at) return false;
  return true;
}

/** 마감까지 남은 일수 (마감일 없으면 null). "마감 D-3" 후크용. */
export function daysLeft(round: Pick<CastingRound, "closesAt">, at = new Date()): number | null {
  if (!round.closesAt) return null;
  const diff = new Date(round.closesAt).getTime() - at.getTime();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

/** 촬영 기간 표시 — "10월 10일 ~ 11월 8일 중 하루" */
export function shootPeriodLabel(round: Pick<CastingRound, "shootFrom" | "shootTo">): string | null {
  if (!round.shootFrom) return null;
  const f = new Date(round.shootFrom);
  const label = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  if (!round.shootTo) return label(f);
  return `${label(f)} ~ ${label(new Date(round.shootTo))} 중 하루`;
}

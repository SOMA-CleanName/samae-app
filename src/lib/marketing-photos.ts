// 마케팅에 써도 되는 사진인가 — 판정 규칙 한 곳.
//
// 규칙이 화면마다 흩어지면 어떤 화면은 써도 된다 하고 다른 화면은 아니라고 한다.
// 그 어긋남이 실제로 밖에 나가는 사진을 고른다. 그래서 여기서만 판정한다.
//
// **게이트는 앨범 단위 `albums.ad_consent` 하나다.**
// 작가가 포트폴리오를 올릴 때 사진 묶음마다 체크한다(선택). 사진마다 받지 않는 이유는
// 사진 속 인물의 초상권이 사진마다 사정이 달라서 — 한 번에 묶는 것 자체가 위험하다.
//
// `photographers.promo_consent` 는 보지 않는다. 컬럼은 있지만 **어디서도 쓰지 않는다**
// (입점 동의 화면이 홍보 동의를 일부러 안 받는다 — AgreeGate.tsx). 전원 false 라
// 이걸 게이트에 넣으면 모든 사진이 사용 불가가 된다.
//
// 아직 못 보는 것: 회원(피사체)의 초상 사용 거부(bookings.portrait_optout_at).
// 예약 단위인데 앨범·사진이 예약을 참조하지 않아 사진까지 이어 붙일 수가 없다.
// 화면에서 이 한계를 숨기지 않는다 — 없는 보증을 있는 것처럼 보이면 그게 더 위험하다.

/** 마케팅 사용 가능 여부를 판정하는 데 필요한 최소 정보 */
export type MarketingPhotoInput = {
  /** 이 사진이 속한 앨범의 광고 소재 사용 동의 */
  albumAdConsent: boolean;
  /** 사진 공개 상태 — 내려간 사진은 애초에 대상이 아니다 */
  visibility: string;
};

export function isMarketingUsable(p: MarketingPhotoInput): boolean {
  return p.albumAdConsent && p.visibility === "published";
}

/**
 * 왜 못 쓰는가 — 화면에 그대로 보여줄 한 줄.
 * 쓸 수 있으면 null. 이유를 안 보여주면 운영이 작가에게 뭘 요청해야 할지 모른다.
 */
export function blockedReason(p: MarketingPhotoInput): string | null {
  if (p.visibility !== "published") return "비공개 사진";
  if (!p.albumAdConsent) return "포트폴리오에 광고 사용 동의 없음";
  return null;
}

// ── 화면에서 쓰는 목록 타입 ──────────────────────────────────────

export type MarketingPhoto = {
  id: string;
  thumbUrl: string | null;
  srcUrl: string;
  photographerId: string;
  photographerName: string;
  albumId: string | null;
  albumTitle: string | null;
  /** 앨범 단위 동의 — 판정의 근거 */
  albumAdConsent: boolean;
  visibility: string;
  /** 운영이 피드에서 내린 사진. 판정에는 안 넣고 표시만 한다(동의와 별개 사안) */
  feedHidden: boolean;
  /** personal · couple · wedding · friendship · event · commercial */
  purpose: string | null;
  /** 작가가 적은 무드 — 자유 입력이라 종류가 많다(검색용) */
  moodTags: string[];
  /** 자동 분류 무드 — 정해진 어휘라 칩으로 고르기 좋다 */
  autoMoodTags: string[];
};

export const PURPOSE_LABELS: Record<string, string> = {
  personal: "개인",
  couple: "커플",
  wedding: "웨딩",
  friendship: "우정",
  event: "행사",
  commercial: "상업",
};

export type MarketingFilter = {
  /** all: 전체 · usable: 사용 가능 · blocked: 사용 불가 */
  consent: "all" | "usable" | "blocked";
  photographerId: string | null;
  purposes: string[];
  /** 자동 무드 — 고른 것 중 하나라도 있으면 통과(OR) */
  moods: string[];
  /** 작가 무드·앨범 제목 검색어 */
  query: string;
  /** 내린 사진도 보여줄지 */
  includeHidden: boolean;
};

export const EMPTY_FILTER: MarketingFilter = {
  consent: "all",
  photographerId: null,
  purposes: [],
  moods: [],
  query: "",
  includeHidden: true,
};

/**
 * 거르기. 조건은 **AND** 로 묶고, 같은 종류의 여러 값은 OR 로 본다
 * (용도 '커플'+'웨딩' = 둘 중 하나, 하지만 그 결과에 작가 조건은 또 걸린다).
 */
export function filterMarketingPhotos(
  photos: MarketingPhoto[],
  f: MarketingFilter
): MarketingPhoto[] {
  const q = f.query.trim().toLowerCase();
  return photos.filter((p) => {
    if (!f.includeHidden && p.feedHidden) return false;

    const usable = isMarketingUsable(p);
    if (f.consent === "usable" && !usable) return false;
    if (f.consent === "blocked" && usable) return false;

    if (f.photographerId && p.photographerId !== f.photographerId) return false;
    if (f.purposes.length > 0 && !f.purposes.includes(p.purpose ?? "")) return false;
    if (f.moods.length > 0 && !f.moods.some((m) => p.autoMoodTags.includes(m))) return false;

    if (q) {
      const hay = [p.albumTitle ?? "", p.photographerName, ...p.moodTags, ...p.autoMoodTags]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** 작가별 집계 — "누구에게 동의를 더 받아야 하는가" 가 이 표의 용도다 */
export function tallyByPhotographer(photos: MarketingPhoto[]) {
  const by = new Map<string, { id: string; name: string; usable: number; blocked: number }>();
  for (const p of photos) {
    const row = by.get(p.photographerId) ?? {
      id: p.photographerId,
      name: p.photographerName,
      usable: 0,
      blocked: 0,
    };
    if (isMarketingUsable(p)) row.usable++;
    else row.blocked++;
    by.set(p.photographerId, row);
  }
  // 못 쓰는 사진이 많은 작가가 위로 — 그쪽이 할 일이 남은 쪽이다
  return [...by.values()].sort((a, b) => b.blocked - a.blocked || b.usable - a.usable);
}

/** 칩으로 보여줄 무드 — 많이 쓰인 순. 45종이 전부 뜨면 고르기 어렵다 */
export function topMoods(photos: MarketingPhoto[], limit = 24): string[] {
  const count = new Map<string, number>();
  for (const p of photos) for (const m of p.autoMoodTags) count.set(m, (count.get(m) ?? 0) + 1);
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([m]) => m);
}

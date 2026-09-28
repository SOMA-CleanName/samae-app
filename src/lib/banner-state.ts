// 배너가 지금 홈에 뜨는가, 안 뜨면 왜 안 뜨는가.
//
// ⚠️ **이걸 만든 이유.** 배너 두 장을 올려 뒀는데 홈에는 아티클만 나온다는 신고가 왔다
//    (2026-09-19). 코드도 RLS 도 정상이었고, 원인은 **두 장 다 3주 전에 기간이 끝난 것**
//    이었다. 어드민에도 표시는 있었다 — 「기간 밖」이라는 **회색 배지** 하나.
//
//    회색은 "정상인데 지금은 아님" 으로 읽힌다. 운영자가 올린 배너가 안 뜨는 건
//    **의도와 어긋난 상태**라 그렇게 조용히 알리면 안 된다. 그리고 「기간 밖」은
//    시작 전인지 끝난 건지도 말해 주지 않아서, 무엇을 고쳐야 하는지가 안 보인다.
//
// 그래서 넷으로 가른다. server-only 를 들이지 않는다 — 테스트가 못 돈다.

export type BannerWindow = {
  published: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

export type BannerState = "live" | "scheduled" | "expired" | "hidden";

export type BannerStatus = {
  state: BannerState;
  /** 배지에 그대로 쓰는 말 */
  label: string;
  /** 어드민 UI 톤 — 운영자 의도와 어긋난 상태는 눈에 띄어야 한다 */
  tone: "success" | "warning" | "neutral";
  /** 지금 홈 캐러셀에 실리는가 */
  live: boolean;
};

/**
 * 판정 순서가 중요하다.
 *
 * **비공개가 먼저다.** 꺼 둔 배너의 기간이 지났다고 「만료」라고 말하면 운영자가
 * 날짜를 고치러 간다 — 고쳐도 안 뜬다. 안 뜨는 진짜 이유는 꺼져 있는 것이다.
 *
 * 그다음 시작 전(예정) → 종료됨(만료) 순. 둘 다 아니면 뜨고 있는 것이다.
 */
export function bannerStatus(b: BannerWindow, now: Date = new Date()): BannerStatus {
  const t = now.getTime();
  if (!b.published) {
    return { state: "hidden", label: "비공개", tone: "neutral", live: false };
  }
  const starts = b.starts_at ? new Date(b.starts_at).getTime() : null;
  const ends = b.ends_at ? new Date(b.ends_at).getTime() : null;
  // 날짜가 깨져 있으면 없는 것으로 본다 — NaN 비교는 전부 false 라
  // 조용히 "노출 중" 이 돼 버린다.
  if (starts !== null && !isNaN(starts) && starts > t) {
    return { state: "scheduled", label: "노출 예정", tone: "neutral", live: false };
  }
  if (ends !== null && !isNaN(ends) && ends <= t) {
    return { state: "expired", label: "기간 끝남", tone: "warning", live: false };
  }
  return { state: "live", label: "노출 중", tone: "success", live: true };
}

/** 지금 홈에 실리는가 — 공개 쿼리(lib/banners)와 같은 조건이어야 한다 */
export function isBannerLive(b: BannerWindow, now: Date = new Date()): boolean {
  return bannerStatus(b, now).live;
}

/**
 * 목록 위에 띄울 한 줄.
 *
 * **0장일 때 가만히 있으면 안 된다.** 등록은 해 뒀는데 하나도 안 뜨는 상태가
 * 이번 신고의 정체였다. 왜 0장인지까지 말해 준다.
 */
export function bannerSummary(rows: BannerWindow[], now: Date = new Date()): string {
  const s = rows.map((b) => bannerStatus(b, now));
  const live = s.filter((x) => x.live).length;
  if (rows.length === 0) return "아직 등록한 배너가 없어요. 없으면 아티클 커버가 대신 실려요.";
  if (live > 0) {
    return live >= 2
      ? `지금 ${live}장이 홈에 떠요. 5초마다 자동으로 넘어가요.`
      : "지금 1장이 홈에 떠요. 2장 이상이면 5초마다 자동으로 넘어가요.";
  }
  const reasons: string[] = [];
  const n = (st: BannerState) => s.filter((x) => x.state === st).length;
  if (n("expired")) reasons.push(`${n("expired")}장은 노출 기간이 끝났어요`);
  if (n("scheduled")) reasons.push(`${n("scheduled")}장은 아직 시작 전이에요`);
  if (n("hidden")) reasons.push(`${n("hidden")}장은 비공개예요`);
  return `지금 홈에 뜨는 배너가 없어요 — ${reasons.join(" · ")}. 그동안은 아티클 커버가 대신 실려요.`;
}

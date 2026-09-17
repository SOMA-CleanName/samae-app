// 예약 표시용 순수 함수 — **서버 전용 모듈에 의존하지 않는다.**
//
// lib/bookings.ts 는 supabase 서버 클라이언트를 물고 있어서, 클라이언트 컴포넌트가
// 거기서 포매터 하나만 가져와도 next/headers 까지 번들에 딸려 들어온다(실제로
// /dev/money 가 그렇게 터졌다). 그래서 계산·표시 함수는 이 파일에 둔다.

/**
 * 어떤 시점으로부터 며칠 지났나 — 예약 상세의 "입금 대기 중 · 3일째" 넛지가 쓴다.
 *
 * ⚠️ 서버 컴포넌트 렌더 안에서 `Date.now()` 를 직접 부르면 react-hooks/purity 에 걸린다.
 *    기본 인자로 감싸 헬퍼에 가둔다 (lib/discovery.ts 의 newFeedSeed 와 같은 처리).
 */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

// KST 일시 표시 — 시각 미정이어도 날짜(shoot_date)가 있으면 날짜까지는 보여준다.
export function fmtShootAt(iso: string | null, dateOnly?: string | null): string {
  if (iso) {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "long", day: "numeric", weekday: "short",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul",
    }).format(new Date(iso));
  }
  if (dateOnly) {
    const d = new Date(`${dateOnly}T00:00:00+09:00`);
    if (!isNaN(d.getTime())) {
      const day = new Intl.DateTimeFormat("ko-KR", {
        month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul",
      }).format(d);
      return `${day} · 시간 협의`;
    }
  }
  return "미정";
}

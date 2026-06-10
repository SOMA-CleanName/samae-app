// 주간 규칙 + 차단 + 기존 예약으로부터 특정 날짜의 "빈 시작시간" 목록 계산.
// 클라이언트(예약 작성)·서버 양쪽에서 쓰므로 순수 함수로 둔다. 시각은 브라우저/서버 로컬(KST) 기준.

export type AvailRule = { weekday: number; start_time: string; end_time: string };
export type TimeRange = { start: string; end: string }; // ISO

// 후보 시작시간 간격(분)
const STEP_MIN = 30;

function hhmmToParts(t: string): [number, number] {
  const [h, m] = t.split(":").map(Number);
  return [h || 0, m || 0];
}

// dateStr: "YYYY-MM-DD" (로컬). durationMin: 패키지 소요시간.
// rules/blocks/busy 와 겹치지 않는 시작시간(ISO) 배열을 반환.
export function availableStartTimes(
  dateStr: string,
  durationMin: number,
  rules: AvailRule[],
  blocks: TimeRange[],
  busy: TimeRange[],
  nowMs: number = Date.now()
): string[] {
  if (!dateStr || !durationMin) return [];
  const base = new Date(`${dateStr}T00:00:00`);
  if (isNaN(base.getTime())) return [];
  const weekday = base.getDay();
  const dayRules = rules.filter((r) => r.weekday === weekday);

  const blockRanges = blocks.map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as const);
  const busyRanges = busy.map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as const);

  const out: string[] = [];
  for (const r of dayRules) {
    const [sh, sm] = hhmmToParts(r.start_time);
    const [eh, em] = hhmmToParts(r.end_time);
    const rangeStart = new Date(base);
    rangeStart.setHours(sh, sm, 0, 0);
    const rangeEnd = new Date(base);
    rangeEnd.setHours(eh, em, 0, 0);

    for (
      let t = rangeStart.getTime();
      t + durationMin * 60000 <= rangeEnd.getTime();
      t += STEP_MIN * 60000
    ) {
      const slotStart = t;
      const slotEnd = t + durationMin * 60000;
      if (slotStart < nowMs) continue; // 과거 제외
      const overlap = (rng: readonly [number, number]) => slotStart < rng[1] && slotEnd > rng[0];
      if (blockRanges.some(overlap) || busyRanges.some(overlap)) continue;
      out.push(new Date(slotStart).toISOString());
    }
  }
  return out.sort();
}

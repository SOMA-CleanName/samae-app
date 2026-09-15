// 영업일 계산 — 환불 환급(3영업일)과 작가 정산(7영업일)이 같은 셈법을 쓴다.
//
// ⚠️ **공휴일은 세지 않는다.** 목록을 들고 있어야 하고 해마다 바뀐다. 안 세면 기한이
//    실제보다 **짧게** 잡혀 우리가 먼저 재촉당하는 쪽이라, 틀리는 방향이 안전하다.
//    (반대로 공휴일을 세면 기한이 늘어나 고객·작가를 기다리게 만든다)

/** 주말을 건너뛰며 n 영업일 뒤를 구한다. 입력은 바꾸지 않는다 */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from.getTime());
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

/** 오늘부터 기한까지 남은 달력일. 음수면 지난 것 */
export function daysUntil(due: Date, now: Date): number {
  const DAY = 24 * 60 * 60 * 1000;
  const KST = 9 * 60 * 60 * 1000;
  const dayIndex = (t: number) => Math.floor((t + KST) / DAY);
  return dayIndex(due.getTime()) - dayIndex(now.getTime());
}

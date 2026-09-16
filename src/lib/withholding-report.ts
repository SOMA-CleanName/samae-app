// 지급명세서 — 원천징수한 것을 **국세청에 신고하는 서류**로 만든다.
//
// 떼는 것까지는 `withholding.ts` 가 했다. 그런데 뗀 세금은 **신고하고 납부해야** 끝난다.
// 안 하면 원천징수만 하고 세금은 안 낸 꼴이라, 작가는 낸 적 없는 세금으로 기록되고
// 우리는 미납이 된다. 떼는 것보다 이쪽을 빠뜨리는 게 더 나쁘다.
//
// ── 제출 기한 (소득세법 제164조·제164조의3) ──────────────────────
//   간이지급명세서(거주자 사업소득)   지급월의 **다음 달 말일**
//   지급명세서(연간)                 다음 해 **3월 10일**
//   원천세 신고·납부                 지급월의 다음 달 **10일**
//
// 지급일은 **정산 송금 시각(`settled_at`)** 이다. 촬영일도 입금일도 아니다 —
// 원천징수 의무는 '지급하는 때' 성립한다(제127조).
//
// ⚠️ 주민등록번호는 이 파일이 만지지 않는다. 집계는 마스킹 값으로 하고, 실제 번호는
//    내보내기 시점에 `resident-no-access.readResidentNo()` 하나로만 연다 — 로그가 남아야 한다.

/** 한 건의 지급 (예약 하나 = 정산 한 번) */
export type WithholdingPayment = {
  bookingId: string;
  photographerId: string;
  /** 사업자등록증·신분증상 성명. 없으면 활동명으로 대신하되 화면이 경고한다 */
  legalName: string | null;
  displayName: string;
  /** 마스킹된 주민번호. 없으면 신고할 수 없다 */
  residentMasked: string | null;
  /** 지급일 = 정산 송금 시각 */
  paidAt: string;
  /** 과세표준 (예약 대금 전체) */
  baseKrw: number;
  incomeTaxKrw: number;
  localTaxKrw: number;
  /** 작가 통장에 실제로 들어간 금액 */
  netKrw: number;
};

/** 작가 한 명의 기간 합계 — 지급명세서는 사람 단위로 낸다 */
export type WithholdingPerson = {
  photographerId: string;
  legalName: string | null;
  displayName: string;
  residentMasked: string | null;
  count: number;
  baseKrw: number;
  incomeTaxKrw: number;
  localTaxKrw: number;
  netKrw: number;
  /** 신고할 수 없는 상태 — 이름이나 주민번호가 비었다 */
  blocked: boolean;
};

/** `YYYY-MM` 이 가리키는 KST 한 달의 [시작, 끝) — 경계를 UTC 로 잘못 자르면 말일 건이 샌다 */
export function periodRange(period: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const from = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0) - 9 * 3600_000);
  const to = new Date(Date.UTC(mo === 12 ? y + 1 : y, mo === 12 ? 0 : mo, 1, 0, 0, 0) - 9 * 3600_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** 그 달의 신고 기한 — 간이지급명세서는 다음 달 말일 */
export function simpleReportDueDate(period: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  // 다음 달의 말일 = 다다음 달 1일 − 1일
  const next = mo === 12 ? { y: y + 1, m: 1 } : { y, m: mo + 1 };
  const last = new Date(Date.UTC(next.m === 12 ? next.y + 1 : next.y, next.m === 12 ? 0 : next.m, 0));
  return last.toISOString().slice(0, 10);
}

/** 건별 → 사람별. 지급명세서는 사람 단위라 여기서 묶는다 */
export function groupByPerson(payments: WithholdingPayment[]): WithholdingPerson[] {
  const map = new Map<string, WithholdingPerson>();
  for (const p of payments) {
    const cur = map.get(p.photographerId) ?? {
      photographerId: p.photographerId,
      legalName: p.legalName,
      displayName: p.displayName,
      residentMasked: p.residentMasked,
      count: 0,
      baseKrw: 0,
      incomeTaxKrw: 0,
      localTaxKrw: 0,
      netKrw: 0,
      blocked: false,
    };
    cur.count += 1;
    cur.baseKrw += p.baseKrw;
    cur.incomeTaxKrw += p.incomeTaxKrw;
    cur.localTaxKrw += p.localTaxKrw;
    cur.netKrw += p.netKrw;
    // 이름이나 주민번호가 비면 그 사람 몫은 신고서에 올릴 수 없다
    cur.blocked = !cur.legalName || !cur.residentMasked;
    map.set(p.photographerId, cur);
  }
  // 금액 큰 순 — 확인해야 할 게 위로 온다
  return [...map.values()].sort((a, b) => b.baseKrw - a.baseKrw);
}

export type ReportTotals = {
  people: number;
  count: number;
  baseKrw: number;
  incomeTaxKrw: number;
  localTaxKrw: number;
  taxKrw: number;
  blocked: number;
};

export function totalsOf(people: WithholdingPerson[]): ReportTotals {
  return people.reduce<ReportTotals>(
    (t, p) => ({
      people: t.people + 1,
      count: t.count + p.count,
      baseKrw: t.baseKrw + p.baseKrw,
      incomeTaxKrw: t.incomeTaxKrw + p.incomeTaxKrw,
      localTaxKrw: t.localTaxKrw + p.localTaxKrw,
      taxKrw: t.taxKrw + p.incomeTaxKrw + p.localTaxKrw,
      blocked: t.blocked + (p.blocked ? 1 : 0),
    }),
    { people: 0, count: 0, baseKrw: 0, incomeTaxKrw: 0, localTaxKrw: 0, taxKrw: 0, blocked: 0 }
  );
}

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈이 들어가면 셀이 밀린다 */
function cell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER = [
  "성명",
  "주민등록번호",
  "지급건수",
  "지급총액",
  "소득세",
  "지방소득세",
  "공제계",
  "실지급액",
] as const;

/**
 * 세무사에게 넘기거나 홈택스에 올릴 표.
 *
 * `residentNoOf` 는 **복호화된 번호**를 돌려준다. 주민번호가 평문으로 나가는 유일한 자리라
 * 호출부가 접근 로그를 남긴 뒤에만 부를 수 있게 함수로 받는다(직접 읽지 않는다).
 */
export function toCsv(
  people: WithholdingPerson[],
  residentNoOf: (photographerId: string) => string | null
): string {
  const lines = [CSV_HEADER.map(cell).join(",")];
  for (const p of people) {
    lines.push(
      [
        cell(p.legalName ?? p.displayName),
        cell(residentNoOf(p.photographerId) ?? p.residentMasked ?? ""),
        cell(p.count),
        cell(p.baseKrw),
        cell(p.incomeTaxKrw),
        cell(p.localTaxKrw),
        cell(p.incomeTaxKrw + p.localTaxKrw),
        cell(p.netKrw),
      ].join(",")
    );
  }
  // 엑셀이 UTF-8 을 못 알아보고 한글을 깨뜨린다 — BOM 을 붙인다
  return "﻿" + lines.join("\n") + "\n";
}

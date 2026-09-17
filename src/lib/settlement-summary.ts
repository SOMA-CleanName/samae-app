// 연간 정산 요약 — **작가가 5월에 이거 한 장으로 신고한다.**
//
// 우리가 원천징수를 하지 않으므로(126 확인, 2026-09-16) 국세청이 우리에게서 받는 자료가
// 없다. 지급명세서도 안 낸다. 그래서 작가는 1년치 거래를 혼자 긁어모아야 하는데,
// 채팅방을 거슬러 올라가며 세는 건 사람이 할 일이 아니다.
//
// 의무는 아니다. 다만 이 한 장이 없으면 작가가 **대금 전액에 세금을 내게 된다** —
// 우리 수수료를 필요경비로 뺄 근거를 못 대서다. 그 증빙이 곧 우리가 발급하는 영수증이고,
// 이 표는 그 영수증들의 합계다.
//
// ── 무엇이 들어가나 ─────────────────────────────────────────────
//   총 대금      작가의 사업소득 총수입금액 (고객이 낸 금액 전체)
//   총 수수료    필요경비 — 중개수수료 + 부가세
//   실수령       통장에 들어온 금액
//   건수         거래 수
//
// ⚠️ **정산이 끝난 건만** 센다. 예정·대기는 그 해 수입이 아니다 — 소득 귀속시기는
//    지급일이고(소득세법 시행령 48조), 아직 안 받은 돈을 수입으로 적으면 틀린 신고가 된다.

import type { SettlementRow } from "./payments";

export type YearSummary = {
  year: number;
  count: number;
  /** 총 대금 = 사업소득 총수입금액 */
  grossKrw: number;
  /** 총 수수료(부가세 포함) = 필요경비 */
  feeKrw: number;
  /** 실수령 합계 */
  netKrw: number;
};

/** 정산 송금 시각(KST)의 연도 */
function settledYear(iso: string): number {
  return Number(
    new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }).slice(0, 4)
  );
}

/** 정산이 끝난 건을 연도별로 묶는다. 최근 연도가 앞 */
export function summarizeByYear(rows: SettlementRow[]): YearSummary[] {
  const map = new Map<number, YearSummary>();
  for (const r of rows) {
    if (r.stage !== "settled" || !r.settledAt) continue;
    const year = settledYear(r.settledAt);
    if (!Number.isFinite(year)) continue;
    const cur = map.get(year) ?? { year, count: 0, grossKrw: 0, feeKrw: 0, netKrw: 0 };
    cur.count += 1;
    cur.grossKrw += r.paidKrw;
    cur.feeKrw += r.feeKrw;
    cur.netKrw += r.netKrw;
    map.set(year, cur);
  }
  return [...map.values()].sort((a, b) => b.year - a.year);
}

/** CSV 한 칸 — 쉼표·따옴표가 들어가면 셀이 밀린다 */
function cell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const SUMMARY_CSV_HEADER = [
  "정산일",
  "고객",
  "촬영일",
  "고객 결제(총수입금액)",
  "사매 수수료·부가세(필요경비)",
  "실수령",
] as const;

/**
 * 그 해 건별 내역 — 세무사에게 넘기거나 홈택스에 붙일 표.
 *
 * 합계만 주면 "이 숫자가 어디서 나왔나" 를 증명할 수 없다. 건별이 있어야 영수증과 대조된다.
 */
export function summaryCsv(
  rows: SettlementRow[],
  year: number,
  fmtDate: (iso: string) => string
): string {
  const lines = [SUMMARY_CSV_HEADER.map(cell).join(",")];
  const mine = rows
    .filter((r) => r.stage === "settled" && r.settledAt && settledYear(r.settledAt) === year)
    .sort((a, b) => (a.settledAt ?? "").localeCompare(b.settledAt ?? ""));

  for (const r of mine) {
    lines.push(
      [
        cell(fmtDate(r.settledAt as string)),
        cell(r.customerName),
        cell(r.shootAt ? fmtDate(r.shootAt) : (r.shootDate ?? "")),
        cell(r.paidKrw),
        cell(r.feeKrw),
        cell(r.netKrw),
      ].join(",")
    );
  }

  const t = summarizeByYear(rows).find((s) => s.year === year);
  if (t) {
    lines.push("");
    lines.push([cell("합계"), cell(`${t.count}건`), "", cell(t.grossKrw), cell(t.feeKrw), cell(t.netKrw)].join(","));
  }
  // 엑셀이 UTF-8 을 못 알아보고 한글을 깨뜨린다 — BOM 을 붙인다
  return "﻿" + lines.join("\n") + "\n";
}

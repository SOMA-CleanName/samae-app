import "server-only";

// 지급명세서에 올릴 건을 DB 에서 긁어 온다. 계산·집계는 withholding-report.ts 가 한다.
//
// 대상은 **그 달에 실제로 송금한 건**이다 — 원천징수 의무는 '지급하는 때' 성립하므로
// (소득세법 127조) 촬영일도 입금일도 아니고 `settled_at` 이다.
//
// 금액은 정산 시점에 굳혀 둔 `settlement_breakdown` 에서 읽는다. 지금 다시 계산하면
// 그 사이 요율이나 사업자 유형이 바뀌었을 때 **이미 통장에 들어간 금액과 다른 숫자**를
// 신고하게 된다.

import { createAdminClient } from "@/lib/supabase/admin";
import { periodRange, type WithholdingPayment } from "@/lib/withholding-report";

type Breakdown = {
  amountKrw?: number;
  withholding?: { baseKrw?: number; incomeTaxKrw?: number; localTaxKrw?: number };
  settlementKrw?: number;
};

export async function loadWithholdingPayments(period: string): Promise<WithholdingPayment[]> {
  const range = periodRange(period);
  if (!range) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("id, photographer_id, settled_at, withholding_krw, settlement_amount_krw, settlement_breakdown, amount_krw")
    .gt("withholding_krw", 0) // 원천징수한 건만 — 사업자 작가는 신고 대상이 아니다
    .gte("settled_at", range.from)
    .lt("settled_at", range.to)
    .order("settled_at", { ascending: true });
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // 이름·마스킹 번호는 작가 쪽에 있다. **평문 주민번호는 여기서 읽지 않는다** —
  // 내보내기 시점에 readResidentNo 하나로만 연다(로그가 남아야 한다).
  const ids = [...new Set(rows.map((r) => r.photographer_id as string))];
  const { data: phs } = await admin
    .from("photographers")
    .select("id, display_name, legal_name, resident_no_masked")
    .in("id", ids);
  const byId = new Map(
    ((phs ?? []) as { id: string; display_name: string | null; legal_name: string | null; resident_no_masked: string | null }[]).map(
      (p) => [p.id, p]
    )
  );

  return rows.map((r) => {
    const bd = (r.settlement_breakdown ?? {}) as Breakdown;
    const w = bd.withholding ?? {};
    const ph = byId.get(r.photographer_id as string);
    const total = (r.withholding_krw as number) ?? 0;
    // 옛 행이라 스냅샷이 없으면 총액만 알고 내역은 모른다 — 소득세 10 : 지방세 1 로 되돌린다
    const incomeTaxKrw = w.incomeTaxKrw ?? Math.round((total * 10) / 11 / 10) * 10;
    return {
      bookingId: r.id as string,
      photographerId: r.photographer_id as string,
      legalName: ph?.legal_name ?? null,
      displayName: ph?.display_name ?? "작가",
      residentMasked: ph?.resident_no_masked ?? null,
      paidAt: r.settled_at as string,
      baseKrw: w.baseKrw ?? bd.amountKrw ?? (r.amount_krw as number) ?? 0,
      incomeTaxKrw,
      localTaxKrw: w.localTaxKrw ?? total - incomeTaxKrw,
      netKrw: bd.settlementKrw ?? (r.settlement_amount_krw as number) ?? 0,
    };
  });
}

/** 원천징수한 건이 있는 달 목록 — 화면의 기간 선택지 */
export async function withholdingPeriods(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bookings")
    .select("settled_at")
    .gt("withholding_krw", 0)
    .not("settled_at", "is", null)
    .order("settled_at", { ascending: false })
    .limit(500);
  const set = new Set<string>();
  for (const r of data ?? []) {
    // KST 기준 달로 묶는다 — UTC 로 자르면 매월 1일 새벽 건이 앞 달로 간다
    const d = new Date(r.settled_at as string);
    set.add(d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }).slice(0, 7));
  }
  return [...set].sort().reverse();
}

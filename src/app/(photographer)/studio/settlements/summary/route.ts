// 연간 정산 내역 CSV — **작가 본인 것만.**
//
// 합계만 주면 "이 숫자가 어디서 나왔나" 를 증명할 수 없다. 건별이 있어야 우리가 발급한
// 영수증과 대조되고, 세무사에게 넘기거나 홈택스에 그대로 붙일 수 있다.
//
// 우리가 원천징수를 하지 않으므로(126 확인, 2026-09-16) 국세청에 올라가는 자료가 없다.
// 작가가 5월에 기댈 게 이 표뿐이다 — 없으면 수수료를 필요경비로 뺄 근거를 못 댄다.
//
// ⚠️ `listMySettlements` 가 RLS 로 **그 작가의 예약만** 돌려준다. 여기서 photographerId 를
//    쿼리로 받지 않는 이유 — 받으면 남의 정산을 긁을 수 있는 구멍이 된다.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listMySettlements } from "@/lib/payments";
import { summaryCsv } from "@/lib/settlement-summary";

export const dynamic = "force-dynamic";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me?.photographer) {
    return new NextResponse("작가만 내려받을 수 있어요.", { status: 403 });
  }

  const raw = new URL(request.url).searchParams.get("year") ?? "";
  const year = Number(raw);
  if (!/^\d{4}$/.test(raw) || !Number.isFinite(year)) {
    return new NextResponse("연도를 4자리로 지정해주세요 (예: ?year=2026).", { status: 400 });
  }

  const rows = await listMySettlements(me.photographer.id);
  const csv = summaryCsv(rows, year, day);
  const filename = `사매_정산내역_${year}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // 한글 파일명은 filename* 로만 안전하게 전달된다
      "Content-Disposition": `attachment; filename="samae-settlements-${year}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

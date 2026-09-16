import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { sendRefundWindowNotices } from "@/lib/refund-notices";

// 환불 구간 전환 예고 (docs/32 §6-4·§6-5) — 매일 09:00 KST(= 00:00 UTC).
//
// ⚠️ **vercel.json 에 직접 걸려 있지 않다** — `/api/cron/daily` 가 불러준다.
//    일과 중 가장 시간에 민감해서 그쪽에서도 맨 앞에 둔다.
//
// 보호: 다른 크론과 동일하게 CRON_SECRET 이 있으면 Bearer 검증.
// 멱등: 발송 표시를 예약 행에 남기므로 같은 날 여러 번 돌아도 중복 발송하지 않는다.

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // service_role 키 필요

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendRefundWindowNotices();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

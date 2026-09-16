import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { markPastShootsAsShot, notifyDeliveryOverdue } from "@/lib/booking-sweep";

// 예약 자동 전이 + 전달 기한 초과 알림.
// 촬영 시각이 지난 예약을 '촬영 완료' 로 넘기고, 결과물 전달 기한이 지난 건은 양쪽에 알린다.
//
// ⚠️ **vercel.json 에 직접 걸려 있지 않다** — `/api/cron/daily` 가 하루 한 번 불러준다.
//    이 엔드포인트는 손으로 이것만 돌려보거나 외부 스케줄러를 붙일 때를 위해 남겨 둔다.
//
// 보호: 다른 크론과 동일하게 CRON_SECRET 이 있으면 Bearer 검증. 멱등(상태 조건부 update).

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // service_role 키 필요

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await markPastShootsAsShot();
  // 같은 크론 안에서 전달 기한 초과도 본다 — 새 크론을 늘리지 않는다 (docs/35)
  const overdue = await notifyDeliveryOverdue();
  return NextResponse.json({ ...result, overdue }, { status: result.ok && overdue.ok ? 200 : 500 });
}

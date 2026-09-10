import { NextResponse } from "next/server";
import { markPastShootsAsShot } from "@/lib/booking-sweep";

// 예약 자동 전이 크론 — 매일 05:00 KST(= 20:00 UTC 전날).
// 촬영 시각이 지난 예약을 '촬영 완료' 로 넘긴다. 작가가 버튼을 누르지 않아
// 결제만 끝난 채 멈춰 있던 예약을 없앤다.
//
// 보호: 다른 크론과 동일하게 CRON_SECRET 이 있으면 Bearer 검증. 멱등(상태 조건부 update).

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // service_role 키 필요

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await markPastShootsAsShot();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

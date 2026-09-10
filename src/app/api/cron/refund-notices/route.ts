import { NextResponse } from "next/server";
import { sendRefundWindowNotices } from "@/lib/refund-notices";

// 환불 구간 전환 예고 크론 (docs/32 §6-4·§6-5) — 매일 09:00 KST(= 00:00 UTC).
// 보호: 다른 크론과 동일하게 CRON_SECRET 이 있으면 Bearer 검증.
// 멱등: 발송 표시를 예약 행에 남기므로 같은 날 여러 번 돌아도 중복 발송하지 않는다.

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

  const result = await sendRefundWindowNotices();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

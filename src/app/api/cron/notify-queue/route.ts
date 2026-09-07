import { NextResponse } from "next/server";
import { runNotificationQueue } from "@/lib/notification-runner";

// 외부 알림 큐 실행기 — 5분 간격.
// 보호: 다른 크론과 동일하게 CRON_SECRET 이 있으면 Bearer 검증.
// 멱등: 처리한 행은 status 가 pending 을 벗어나므로 같은 회차가 겹쳐 돌아도 중복 발송하지 않는다.

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

  const result = await runNotificationQueue();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

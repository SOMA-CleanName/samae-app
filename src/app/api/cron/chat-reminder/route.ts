import { NextResponse } from "next/server";
import { sendChatReminders } from "@/lib/chat-reminder";

// 미열람 채팅 리마인더 크론.
//
// 고정 시각이 아니라 **대화마다 시계가 따로 돈다** — "마지막 알림 + 12시간이 지나도
// 안 읽었으면 한 번 더". 그래서 이 엔드포인트는 주기가 아니라 **스캐너**다.
// 자주 부를수록 정밀해지고(매시간이면 12~13시간 사이 도착), 드물게 부르면 늦어질 뿐
// 규칙 자체는 변하지 않는다.
//
// 호출자는 누구든 된다 —
//   · Vercel 크론 (vercel.json). **지금 계정은 Hobby 라 하루 1회가 상한이다.**
//     매시간(`0 * * * *`)으로 걸었다가 배포가 통째로 거부됐다(cron-jobs/usage-and-pricing).
//     그래서 10:00 KST 하루 1회로 두었고, 그만큼 리마인더가 12~36시간 사이에 도착한다.
//   · Supabase pg_cron + pg_net 으로 이 URL 을 직접 때려도 된다 — **빈도 제한이 없어서
//     매시간 부르면 12~13시간으로 좁혀진다.** 그쪽을 붙이면 vercel.json 항목은 빼도 된다.
//
// 멱등: 보낼 때마다 notification_queue 에 새 발송 시각이 남고 그게 다음 회차의 기준이 된다.
// 같은 대화에 대해 12시간 안에 두 번 나가지 않는다.
//
// 보호: 다른 크론과 동일하게 CRON_SECRET 이 있으면 Bearer 검증.

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

  const result = await sendChatReminders();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

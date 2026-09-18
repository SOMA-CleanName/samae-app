import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { sendRefundWindowNotices } from "@/lib/refund-notices";
import { markPastShootsAsShot, notifyDeliveryOverdue } from "@/lib/booking-sweep";
import { sendChatReminders } from "@/lib/chat-reminder";
import { pingIndexNow } from "@/lib/indexnow";

// 하루 한 번 도는 일과 전부 — 매일 09:00 KST(= 00:00 UTC).
//
// **왜 하나로 합쳤나.** Vercel Hobby 는 크론 개수와 빈도가 둘 다 묶여 있다(하루 1회).
// 일과가 늘 때마다 크론을 하나씩 늘리다 보니 한도에 부딪혔고, 한 번은 배포가 통째로
// 거부됐다(`b91785e`). 일과가 전부 "하루 한 번, 순서 안 따짐" 이라 굳이 나눠 걸
// 이유도 없었다 — 크론 슬롯은 앞으로 **빈도가 다른 일**을 위해 남겨둔다.
//
// ⚠️ **한 작업이 실패해도 나머지는 돈다.** 크론이 따로였을 땐 이게 공짜로 딸려오는
//    성질이었다(각자 다른 요청이니까). 합치면서 잃기 쉬운 지점이라 명시적으로 감싼다.
//    하나라도 실패하면 500 을 돌려주되, **실패한 뒤에도 남은 작업은 전부 시도한 뒤**다.
//
// 개별 엔드포인트(`/api/cron/booking-sweep` 등)는 그대로 남겨 뒀다 —
//   · 손으로 하나만 돌려보고 싶을 때
//   · Supabase pg_cron + pg_net 으로 **더 자주** 때리고 싶을 때. 특히 chat-reminder 는
//     스캐너라 자주 부를수록 정밀해진다(그쪽을 붙이면 여기서 빼도 된다)
// 다만 vercel.json 에 거는 건 이 하나뿐이다.
//
// 멱등: 네 작업 모두 발송 표시를 행에 남기거나 상태 조건부 update 라, 같은 날 여러 번
// 돌아도 중복 발송하지 않는다.

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // service_role 키 필요

type TaskResult = { ok: boolean; [k: string]: unknown };

/** 한 작업의 실패를 그 작업 안에 가둔다 — throw 든 ok:false 든 다음 작업을 막지 않는다. */
async function run(name: string, task: () => Promise<TaskResult>) {
  try {
    return { name, ...(await task()) };
  } catch (e) {
    return { name, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 순서는 급한 것부터 — 환불 구간 예고가 가장 시간에 민감하다(구간이 닫히기 전에
  // 나가야 하고, 안 나가면 그게 곧 분쟁이다. 취소환불 §6-4·§6-5).
  const tasks = [
    await run("refund-notices", sendRefundWindowNotices),
    await run("delivery-overdue", notifyDeliveryOverdue),
    await run("past-shoots", markPastShootsAsShot),
    await run("chat-reminders", sendChatReminders),
    // 검색엔진에 "어제 바뀐 것" 을 알린다. 네이버는 sitemap 만 보고 알아서 오지 않는다.
    // 발행 자리마다 붙이지 않고 여기 한 곳에서 sitemap 을 읽는 이유는 lib/indexnow.ts 주석에.
    await run("indexnow", pingIndexNow),
  ];

  const ok = tasks.every((t) => t.ok);
  return NextResponse.json({ ok, tasks }, { status: ok ? 200 : 500 });
}

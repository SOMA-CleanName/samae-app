// 환불 신청 알림을 **진짜 경로로** 한 번 쏴 보는 개발용 방아쇠.
//
// 왜 필요한가. 알림은 고객이 실제로 [사매에 문의 → 환불] 을 눌러야 나간다. 그걸 확인하려고
// 문구를 손으로 만들어 웹훅에 던지면, 정작 진짜 경로는 여전히 확인이 안 된 채로 남는다.
// 그래서 여기서는 **서버 액션과 똑같은 함수**(lib/support-requests.createSupportRequest)를
// 부른다 — 행 삽입 · refund_due_at 기산 · 채팅 흔적 · 디스코드까지 전부 실제로 일어난다.
//
// ⚠️ 진짜 행이 남는다. 지운 뒤에 쓰라고 안내하는 대신 삭제까지 여기서 할 수 있게 뒀다
//    (`?undo=<요청id>`). 확인용 찌꺼기가 접수함에 남으면 그게 다음 사람을 헷갈리게 한다.
//
// 프로덕션에서는 두 겹으로 막힌다: proxy.ts 의 blockDevRoutes 가 /dev/* 를 404 로 돌리고,
// 여기서도 NODE_ENV 를 다시 본다.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupportRequest } from "@/lib/support-requests";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(request.url);
  const admin = createAdminClient();

  // 남긴 흔적 치우기 — 접수함과 채팅에서 같이 지운다
  const undo = url.searchParams.get("undo");
  if (undo) {
    const { data: req } = await admin
      .from("support_requests")
      .select("id, booking_id, conversation_id, created_at")
      .eq("id", undo)
      .maybeSingle();
    if (!req) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    await admin.from("support_requests").delete().eq("id", undo);
    if (req.booking_id) {
      await admin.from("bookings").update({ refund_due_at: null }).eq("id", req.booking_id);
    }
    if (req.conversation_id) {
      await admin
        .from("messages")
        .delete()
        .eq("conversation_id", req.conversation_id)
        .eq("type", "system")
        .gte("created_at", req.created_at as string)
        .like("body", "🛟 사매에%");
    }
    return NextResponse.json({ ok: true, undone: undo });
  }

  const bookingId = url.searchParams.get("booking");
  if (!bookingId) {
    // 어느 예약으로 쏠지 고르라고 후보를 보여준다
    const { data } = await admin
      .from("bookings")
      .select(
        "id, status, amount_krw, shoot_at, refund_due_at, user:profiles!bookings_user_id_fkey(display_name)"
      )
      .order("created_at", { ascending: false })
      .limit(20);
    return NextResponse.json({
      usage: "/dev/refund-test?booking=<id>  ·  되돌리기: /dev/refund-test?undo=<요청id>",
      bookings: data ?? [],
    });
  }

  const { data: b } = await admin
    .from("bookings")
    .select("id, user_id, photographer_id, status, amount_krw, refund_due_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return NextResponse.json({ ok: false, reason: "booking_not_found" }, { status: 404 });

  // 이 예약이 걸린 대화 — 실제 흐름에서는 채팅방에서 신청하므로 흔적이 남는다
  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("user_id", b.user_id)
    .eq("photographer_id", b.photographer_id)
    .maybeSingle();

  const created = await createSupportRequest({
    requesterId: b.user_id as string, // 이 예약의 고객 본인 — 실제 흐름과 같다
    requesterRole: "customer",
    bookingId: b.id as string,
    conversationId: (conv?.id as string) ?? null,
    kind: "refund",
    body:
      url.searchParams.get("body") ??
      "[테스트] 환불 알림 확인용 요청입니다. 확인 후 지워주세요.",
    refundAccount: { bank: "국민은행", number: "123456-01-789012", holder: "테스트" },
  });

  return NextResponse.json({
    ok: true,
    requestId: created.id,
    bookingId: b.id,
    conversationId: conv?.id ?? null,
    undo: `/dev/refund-test?undo=${created.id}`,
  });
}

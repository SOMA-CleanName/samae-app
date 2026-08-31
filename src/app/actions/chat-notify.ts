"use server";

// 새 메시지 알림에 필요한 최소 정보만 돌려준다.
//
// 브라우저는 Realtime 으로 messages INSERT 를 이미 받는다(RLS 가 내 대화만 흘려보낸다).
// 다만 그 payload 에는 '누가 보냈는지' 가 sender_id 뿐이라 이름도 사진도 없다.
// 상대 이름은 profiles RLS(본인/관리자만) 때문에 클라이언트가 직접 못 읽는다.
// 그래서 참여자임을 다시 확인한 뒤 이름·아바타만 골라 준다 — 연락처 같은 건 주지 않는다.

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ChatNotice = {
  conversationId: string;
  /** 상대 표시 이름 */
  title: string;
  avatarUrl: string | null;
  /** 알림에 뜰 한 줄 */
  preview: string;
};

/** 카드·시스템 메시지는 본문을 그대로 읽히면 안 되거나 읽어도 뜻이 안 통한다 */
function previewOf(type: string, body: string, hasBooking: boolean): string {
  if (type === "image") return "사진을 보냈어요";
  if (type === "contact_card") return "연락처를 보냈어요";
  if (type === "summary_card") return "문의 내용이 정리됐어요";
  if (hasBooking) return "예약 카드를 보냈어요";
  const line = (body || "").trim().split("\n")[0];
  return line.length > 80 ? line.slice(0, 80) + "…" : line || "새 메시지가 왔어요";
}

/**
 * 방금 들어온 메시지를 알림 한 줄로 만든다.
 * 내가 보낸 메시지거나 그 방 참여자가 아니면 null — 화면에 아무것도 띄우지 않는다.
 */
export async function previewIncoming(messageId: string): Promise<ChatNotice | null> {
  const me = await getCurrentUser();
  if (!me) return null;

  // RLS 로 한 번 거른다 — 내 대화의 메시지가 아니면 여기서 비어서 온다
  const supabase = await createClient();
  const { data: msg } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, type, body, booking_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return null;
  if (msg.sender_id === me.id) return null;

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, user_id, photographer_id, bot_disabled_at")
    .eq("id", msg.conversation_id)
    .maybeSingle();
  if (!conv) return null;

  const amCustomer = conv.user_id === me.id;

  // 봇이 응대 중인 방 — 작가에게는 '첫 문의' 한 번만 알린다.
  //
  // 수집 대화는 원래 무알림이다(bot-actions.ts). 봇에게 맡겨둔 대화를 매 발화마다
  // 띄우면 맡긴 의미가 없고, 작가는 알림을 꺼버린다. 대신 문의가 시작됐다는 사실은
  // 놓치면 안 되므로 첫 발화 한 번만 띄운다 — bot_inquiry_started 알림과 같은 시점이다.
  // (그 뒤로 쌓이는 건 채팅 목록의 안읽음 배지가 맡는다)
  if (!amCustomer && conv.bot_disabled_at == null) {
    if (msg.type !== "bot") return null; // 방을 열 때 딸려오는 시드 사진 등
    const { count } = await createAdminClient()
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conv.id)
      .eq("sender_id", conv.user_id)
      .eq("type", "bot");
    if ((count ?? 0) !== 1) return null; // 첫 발화가 아니면 조용히 넘긴다

    const admin0 = createAdminClient();
    const { data: p0 } = await admin0
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", conv.user_id)
      .maybeSingle();
    return {
      conversationId: conv.id as string,
      title: (p0?.display_name as string | null) ?? "고객님",
      avatarUrl: (p0?.avatar_url as string | null) ?? null,
      preview: "새 문의가 들어왔어요 · 안내봇이 먼저 답하고 있어요",
    };
  }

  // 상대 이름·아바타 — RLS 를 이미 통과했으므로 표시용 두 필드만 admin 으로 채운다
  const admin = createAdminClient();
  let title = "새 메시지";
  let avatarUrl: string | null = null;

  if (amCustomer) {
    const { data: ph } = await admin
      .from("photographers")
      .select("display_name, profile_id")
      .eq("id", conv.photographer_id)
      .maybeSingle();
    title = ph?.display_name ?? "작가님";
    if (ph?.profile_id) {
      const { data: p } = await admin
        .from("profiles")
        .select("avatar_url")
        .eq("id", ph.profile_id)
        .maybeSingle();
      avatarUrl = (p?.avatar_url as string | null) ?? null;
    }
  } else {
    const { data: p } = await admin
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", conv.user_id)
      .maybeSingle();
    title = (p?.display_name as string | null) ?? "고객님";
    avatarUrl = (p?.avatar_url as string | null) ?? null;
  }

  // 봇이 답한 건 봇 이름으로 — 작가가 답한 것처럼 보이면 안 된다
  if (msg.type === "bot") title = "사매 안내봇";

  return {
    conversationId: msg.conversation_id as string,
    title,
    avatarUrl,
    preview: previewOf(msg.type as string, (msg.body as string) ?? "", !!msg.booking_id),
  };
}

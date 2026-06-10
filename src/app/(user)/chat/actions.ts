"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

// 작가에게 채팅 시작 — 대화방 get-or-create 후 이동.
// 사진에서 시작하면(photoId) 신규 대화에 그 사진을 첫 메시지로 첨부해 맥락 전달.
export async function startConversation(formData: FormData) {
  const photographerId = String(formData.get("photographerId"));
  const photoId = String(formData.get("photoId") || "");
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  // 본인이 그 작가면 자기 자신과 대화 불가
  if (me.photographer?.id === photographerId) redirect("/studio");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", me.id)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (existing) redirect(`/chat/${existing.id}`);

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ user_id: me.id, photographer_id: photographerId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // 신규 대화 — 사진에서 시작했다면 그 사진을 첫 메시지로 첨부
  if (photoId) {
    const { data: photo } = await supabase
      .from("photos")
      .select("src_url, thumb_url")
      .eq("id", photoId)
      .maybeSingle();
    if (photo) {
      const admin = createAdminClient();
      await admin.from("messages").insert({
        conversation_id: created.id,
        sender_id: me.id,
        type: "image",
        body: "이 사진을 보고 문의드려요",
        image_path: photo.thumb_url ?? photo.src_url,
      });
    }
  }

  redirect(`/chat/${created.id}`);
}

// 텍스트 메시지 전송 (RLS: 발신자=본인 + 대화 참여자)
export async function sendMessage(conversationId: string, body: string) {
  const text = body.trim();
  if (!text) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    type: "text",
    body: text,
  });
  if (error) throw new Error(error.message);
}

// 채팅방 나가기 — 내 쪽에서만 숨김(상대/기록은 유지, 새 메시지 오면 다시 보임)
export async function leaveConversation(formData: FormData) {
  const conversationId = String(formData.get("conversationId"));
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/chat");

  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("user_id, photographer_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return;

  const isUser = conv.user_id === me.id;
  const isPhotographer = me.photographer?.id === conv.photographer_id;
  if (!isUser && !isPhotographer) return;

  // 내 쪽 숨김 시각 기록 + 내 안읽음 0
  const now = new Date().toISOString();
  const patch = isUser
    ? { user_hidden_at: now, user_unread: 0 }
    : { photographer_hidden_at: now, photographer_unread: 0 };
  await supabase.from("conversations").update(patch).eq("id", conversationId);
  revalidatePath("/chat");
}

// 대화 진입 시 내 안읽음 0으로
export async function markRead(conversationId: string) {
  const me = await getCurrentUser();
  if (!me) return;
  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("user_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return;

  const patch =
    conv.user_id === me.id ? { user_unread: 0 } : { photographer_unread: 0 };
  await supabase.from("conversations").update(patch).eq("id", conversationId);
  revalidatePath("/chat");
}

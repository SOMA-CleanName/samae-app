import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";

export type ConversationListItem = {
  id: string;
  user_id: string;
  photographer_id: string;
  last_message_at: string | null;
  user_unread: number;
  photographer_unread: number;
  photographer: { handle: string; display_name: string | null } | null;
  user: { display_name: string | null } | null;
};

export type ChatMessage = {
  id: string;
  sender_id: string;
  type: "text" | "image" | "system";
  body: string;
  image_path: string | null;
  created_at: string;
};

// 내 대화 목록 (RLS가 참여 대화로 제한) — 상대 정보 포함
export async function listConversations(): Promise<ConversationListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id, user_id, photographer_id, last_message_at, user_unread, photographer_unread, " +
        "photographer:photographers(handle, display_name), " +
        "user:profiles!conversations_user_id_fkey(display_name)"
    )
    .order("last_message_at", { ascending: false, nullsFirst: false });
  return (data ?? []) as unknown as ConversationListItem[];
}

// 대화 1건 (접근 불가 시 null)
export async function getConversation(id: string): Promise<ConversationListItem | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id, user_id, photographer_id, last_message_at, user_unread, photographer_unread, " +
        "photographer:photographers(handle, display_name), " +
        "user:profiles!conversations_user_id_fkey(display_name)"
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as ConversationListItem) ?? null;
}

// 대화 메시지 목록
export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, sender_id, type, body, image_path, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []) as ChatMessage[];
}

// 대화 상대 표시명 (내 관점)
export function counterpartName(c: ConversationListItem, me: CurrentUser): string {
  if (c.user_id === me.id) {
    return c.photographer?.display_name || `@${c.photographer?.handle ?? "작가"}`;
  }
  return c.user?.display_name || "고객";
}

// 내 안읽음 수 (내 관점)
export function myUnread(c: ConversationListItem, me: CurrentUser): number {
  return c.user_id === me.id ? c.user_unread : c.photographer_unread;
}

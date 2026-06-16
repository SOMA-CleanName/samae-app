import "server-only";

import { createClient } from "@/lib/supabase/server";

// 알림 1건 (예약·결제 등). 채팅 알림은 채팅 화면이 따로 처리하므로 센터에서는 제외.
export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  inquiry_id: string | null;
  inquiry: { status: string | null; accepted_at: string | null } | null;
  read_at: string | null;
  created_at: string;
};

// 채팅 알림(type='chat')은 채팅 안읽음 배지로 대체 → 센터에서는 제외(중복 방지)

// 내 알림 목록 (RLS: 본인 수신만)
export async function listMyNotifications(): Promise<AppNotification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, inquiry_id, inquiry:inquiries(status, accepted_at), read_at, created_at")
    .neq("type", "chat")
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = ((data ?? []) as unknown as Array<
    Omit<AppNotification, "inquiry"> & {
      inquiry: AppNotification["inquiry"] | AppNotification["inquiry"][];
    }
  >).map((item) => ({
    ...item,
    inquiry: Array.isArray(item.inquiry) ? item.inquiry[0] ?? null : item.inquiry,
  }));

  return rows.filter((item) => !item.inquiry_id || item.inquiry?.status !== "accepted");
}

// 안읽은 알림 수 (채팅 제외) — 사이드바 배지
export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .neq("type", "chat")
    .is("read_at", null);
  return count ?? 0;
}

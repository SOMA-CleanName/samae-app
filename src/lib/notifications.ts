import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
// 문의 상태는 inquiries RLS(정책 없음=deny)로 임베드가 막히므로 service-role 로 따로 조회해 머지한다.
export async function listMyNotifications(): Promise<AppNotification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, inquiry_id, read_at, created_at")
    .neq("type", "chat")
    .order("created_at", { ascending: false })
    .limit(50);

  const base = (data ?? []) as Array<Omit<AppNotification, "inquiry">>;

  // 참조된 문의들의 현재 상태
  const inquiryIds = [...new Set(base.filter((r) => r.inquiry_id).map((r) => r.inquiry_id as string))];
  const statusById = new Map<string, { status: string | null; accepted_at: string | null }>();
  if (inquiryIds.length > 0) {
    const admin = createAdminClient();
    const { data: inq } = await admin
      .from("inquiries")
      .select("id, status, accepted_at")
      .in("id", inquiryIds);
    for (const i of inq ?? [])
      statusById.set(i.id as string, {
        status: (i.status as string | null) ?? null,
        accepted_at: (i.accepted_at as string | null) ?? null,
      });
  }

  return base
    .map((item) => ({
      ...item,
      inquiry: item.inquiry_id ? statusById.get(item.inquiry_id) ?? null : null,
    }))
    // 문의 수락 대기(booking) 알림은 이미 수락/진행되면(new 아님) 숨김
    .filter(
      (item) =>
        !(item.type === "booking" && item.inquiry_id && (item.inquiry?.status ?? "new") !== "new")
    );
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

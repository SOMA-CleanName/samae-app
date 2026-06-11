import "server-only";

import { createClient } from "@/lib/supabase/server";

export type BookingStatus =
  | "requested" | "accepted" | "paid" | "shot"
  | "delivered" | "completed" | "rejected" | "cancelled" | "refunded";

// 상태 한글 라벨 + 색조
export const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "요청됨",
  accepted: "수락됨 · 송금 대기",
  paid: "입금 확인됨",
  shot: "촬영 완료",
  delivered: "보정본 전달됨",
  completed: "완료",
  rejected: "거절됨",
  cancelled: "취소됨",
  refunded: "환불됨",
};

export function statusTone(s: BookingStatus): string {
  if (s === "completed" || s === "paid") return "bg-emerald-500/15 text-emerald-700";
  if (s === "requested" || s === "accepted") return "bg-amber-500/15 text-amber-700";
  if (s === "rejected" || s === "cancelled" || s === "refunded") return "bg-brand/15 text-brand";
  return "bg-fg/10 text-fg/60";
}

export type BookingRow = {
  id: string;
  status: BookingStatus;
  shoot_at: string | null;
  location_text: string | null;
  amount_krw: number | null;
  memo: string;
  user_id: string;
  photographer_id: string;
  created_at: string;
  accepted_at: string | null;
  proposed_by_photographer: boolean;
  package_snapshot: { name?: string } | null;
  photographer: { display_name: string | null } | null;
  user: { display_name: string | null } | null;
  package: { name: string } | null;
};

const SELECT =
  "id, status, shoot_at, location_text, amount_krw, memo, user_id, photographer_id, created_at, accepted_at, proposed_by_photographer, package_snapshot, " +
  "photographer:photographers(display_name), " +
  "user:profiles!bookings_user_id_fkey(display_name), " +
  "package:packages(name)";

// 내 예약 목록 (RLS: 구매자 또는 해당 작가)
export async function listMyBookings(): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select(SELECT)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as BookingRow[];
}

// 진행 중(종료 안 된) 예약 상태 — 사이드바 배지 집계용
const ACTIVE_STATUSES: BookingStatus[] = [
  "requested", "accepted", "paid", "shot", "delivered",
];

// 진행 중 예약 개수 (RLS: 구매자 또는 해당 작가) — 사이드바 '예약' 배지
export async function countActiveBookings(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .in("status", ACTIVE_STATUSES);
  return count ?? 0;
}

// 예약 1건
export async function getBooking(id: string): Promise<BookingRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("bookings").select(SELECT).eq("id", id).maybeSingle();
  return (data as unknown as BookingRow) ?? null;
}

// 예약 → 채팅방 매핑. 대화는 (user_id, photographer_id) 유니크라 그 키로 찾는다.
// RLS가 내 대화만 반환하므로 키 충돌 없음. (예약 목록의 '채팅 바로가기'용)
export async function getConversationMap(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("conversations").select("id, user_id, photographer_id");
  const map = new Map<string, string>();
  for (const c of data ?? []) {
    map.set(`${c.user_id}:${c.photographer_id}`, c.id as string);
  }
  return map;
}

// 예약 1건 → 채팅방 id (예약 상세의 '채팅방으로 가기'용)
export async function getConversationIdFor(
  userId: string,
  photographerId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("photographer_id", photographerId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

// KST 일시 표시
export function fmtShootAt(iso: string | null): string {
  if (!iso) return "미정";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long", day: "numeric", weekday: "short",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

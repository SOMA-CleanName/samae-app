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
  package_snapshot: { name?: string } | null;
  photographer: { display_name: string | null } | null;
  user: { display_name: string | null } | null;
  package: { name: string } | null;
};

const SELECT =
  "id, status, shoot_at, location_text, amount_krw, memo, user_id, photographer_id, created_at, accepted_at, package_snapshot, " +
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

// KST 일시 표시
export function fmtShootAt(iso: string | null): string {
  if (!iso) return "미정";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long", day: "numeric", weekday: "short",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

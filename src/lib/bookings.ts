import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 상태 타입·라벨·색조는 booking-status.ts 에 있다 (클라이언트 공용). 호출부 편의를 위해 재수출.
export {
  STATUS_LABEL,
  statusTone,
  bookingStatusLabel,
  type BookingStatus,
} from "./booking-status";
import type { BookingStatus } from "./booking-status";

export type BookingRow = {
  id: string;
  status: BookingStatus;
  shoot_at: string | null;
  shoot_date: string | null;
  location_text: string | null;
  amount_krw: number | null;
  travel_fee_krw: number; // 출장비 — 예약 카드·상세에서 촬영비와 분리 표기
  memo: string;
  user_id: string;
  photographer_id: string;
  created_at: string;
  accepted_at: string | null;
  transfer_marked_at: string | null;
  proposed_by_photographer: boolean;
  package_snapshot: { name?: string } | null;
  photographer: { display_name: string | null } | null;
  user: { display_name: string | null } | null;
  package: { name: string } | null;
};

const SELECT =
  "id, status, shoot_at, shoot_date, location_text, amount_krw, travel_fee_krw, memo, user_id, photographer_id, created_at, accepted_at, transfer_marked_at, proposed_by_photographer, package_snapshot, " +
  "photographer:photographers(display_name), " +
  "user:profiles!bookings_user_id_fkey(display_name), " +
  "package:packages(name)";

// 작가 시점에서는 고객 profiles 행이 RLS(본인/관리자만)에 막혀 user.display_name이 비어 와
// '고객'으로 표시된다. 이미 RLS로 참여가 확인된 예약에 한해 admin으로 '이름만' 보강한다
// (phone 등 민감정보는 노출하지 않음). chat.ts의 fillCustomerNames와 동일한 패턴.
async function fillBookingCustomerNames(rows: BookingRow[]): Promise<void> {
  const missing = rows.filter((b) => !b.user?.display_name);
  if (missing.length === 0) return;
  const ids = [...new Set(missing.map((b) => b.user_id))];
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id, display_name").in("id", ids);
  const nameById = new Map((data ?? []).map((r) => [r.id, r.display_name as string | null]));
  for (const b of missing) {
    b.user = { display_name: nameById.get(b.user_id) ?? null };
  }
}

// 내 예약 목록 (RLS: 구매자 또는 해당 작가)
export async function listMyBookings(): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select(SELECT)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as BookingRow[];
  await fillBookingCustomerNames(rows); // 작가 시점 고객 이름 보강
  return rows;
}

// 예약 1건
export async function getBooking(id: string): Promise<BookingRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("bookings").select(SELECT).eq("id", id).maybeSingle();
  const b = (data as unknown as BookingRow) ?? null;
  if (b) await fillBookingCustomerNames([b]); // 작가 시점 고객 이름 보강
  return b;
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

// KST 일시 표시 — 시각 미정이어도 날짜(shoot_date)가 있으면 날짜까지는 보여준다.
export function fmtShootAt(iso: string | null, dateOnly?: string | null): string {
  if (iso) {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "long", day: "numeric", weekday: "short",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul",
    }).format(new Date(iso));
  }
  if (dateOnly) {
    const d = new Date(`${dateOnly}T00:00:00+09:00`);
    if (!isNaN(d.getTime())) {
      const day = new Intl.DateTimeFormat("ko-KR", {
        month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul",
      }).format(d);
      return `${day} · 시간 협의`;
    }
  }
  return "미정";
}

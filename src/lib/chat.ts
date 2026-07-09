import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/auth";

export type ConversationListItem = {
  id: string;
  user_id: string;
  photographer_id: string;
  last_message_at: string | null;
  user_unread: number;
  photographer_unread: number;
  user_hidden_at: string | null;
  photographer_hidden_at: string | null;
  source_photo_path: string | null; // 사진에서 문의 시작 시 그 사진 경로(상담 정보에 노출)
  photographer: { display_name: string | null; profile_id?: string | null } | null;
  user: { display_name: string | null } | null;
  // 상대 아바타 — profiles는 RLS상 본인만 조회 가능해 admin으로 보강(아래 fillCounterpartInfo)
  user_avatar_url?: string | null;
  photographer_avatar_url?: string | null;
};

// 채팅방 진행 상태 (예약 단계에서 파생)
export type ChatStatus = "consulting" | "booked" | "shot";
export const CHAT_STATUS_LABEL: Record<ChatStatus, string> = {
  consulting: "상담 중",
  booked: "예약 완료",
  shot: "촬영 완료",
};
export type ChatRoomItem = ConversationListItem & { status: ChatStatus };

// 예약 제안 카드용 스냅샷 (편집 프리필을 위해 package_id·memo 포함)
export type BookingSnapshot = {
  id: string;
  status: string;
  shoot_at: string | null;
  location_text: string | null;
  amount_krw: number | null;
  travel_fee_krw: number;
  package_snapshot: { name?: string } | null;
  package_id: string | null;
  memo: string | null;
  transfer_marked_at: string | null; // 구매자가 송금 완료를 알린 시각
  proposed_by_photographer: boolean; // 작가가 제안한 건(=구매자가 수락 주체)
};

export type ChatMessage = {
  id: string;
  sender_id: string;
  type: "text" | "image" | "system";
  body: string;
  image_path: string | null;
  created_at: string;
  booking_id: string | null;
  booking?: BookingSnapshot | null;
};

const CONV_COLS =
  "id, user_id, photographer_id, last_message_at, user_unread, photographer_unread, " +
  "user_hidden_at, photographer_hidden_at, source_photo_path, " +
  "photographer:photographers(display_name, profile_id), " +
  "user:profiles!conversations_user_id_fkey(display_name)";

// 대화 상대의 표시 정보(이름·아바타)를 보강한다.
// profiles는 RLS(profiles_select: 본인/관리자만)라 작가 시점의 고객 이름·아바타,
// 고객 시점의 작가 아바타(profiles 경유)가 비어서 온다. 이미 RLS로 참여자임이 확인된
// 대화에 한해 admin으로 '이름·아바타만' 보강한다(phone 등 민감정보는 노출하지 않음).
async function fillCounterpartInfo(convs: ConversationListItem[]): Promise<void> {
  if (convs.length === 0) return;
  const ids = new Set<string>();
  for (const c of convs) {
    ids.add(c.user_id); // 고객
    if (c.photographer?.profile_id) ids.add(c.photographer.profile_id); // 작가 소유 profile
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", [...ids]);
  const byId = new Map((data ?? []).map((r) => [r.id, r]));
  for (const c of convs) {
    const u = byId.get(c.user_id);
    // 고객 이름: 본인 행이면 join으로 이미 채워짐, 작가 시점이면 admin 보강
    c.user = { display_name: c.user?.display_name ?? u?.display_name ?? null };
    c.user_avatar_url = (u?.avatar_url as string | null) ?? null;
    const p = c.photographer?.profile_id ? byId.get(c.photographer.profile_id) : undefined;
    c.photographer_avatar_url = (p?.avatar_url as string | null) ?? null;
  }
}

// 내 대화 목록 (RLS가 참여 대화로 제한) — 상대 정보 포함. (안읽음 배지 집계용 — 전체)

// 채팅 리스트 화면용 — 실제 대화가 오간 방만 + 내가 나가지 않은 방만 + 진행 상태 부착
export async function listChatRooms(me: CurrentUser): Promise<ChatRoomItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select(CONV_COLS)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  const convs = (data ?? []) as unknown as ConversationListItem[];

  // 상담 정보가 입력된 대화 id — 아직 메시지가 없어도 '활성'으로 보고 노출.
  // (사진/프로필에서 방만 만들고 아직 대화가 없는 빈 방은 작가에게 숨김)
  const { data: briefs } = await supabase
    .from("consultation_briefs")
    .select("conversation_id");
  const withBrief = new Set((briefs ?? []).map((b) => b.conversation_id as string));

  // 예약 상태 맵 — (user_id:photographer_id) → '가장 최근 활성 예약' 상태.
  // 거절/취소/환불은 제외하고 created_at desc로 최신 1건만 반영(역대 최고 단계 오표시 방지).
  const { data: bookings } = await supabase
    .from("bookings")
    .select("user_id, photographer_id, status, created_at")
    .order("created_at", { ascending: false });
  const latestByPair = new Map<string, string>();
  for (const b of bookings ?? []) {
    if (!LIVE_STATUSES.has(b.status as string)) continue;
    const key = `${b.user_id}:${b.photographer_id}`;
    if (!latestByPair.has(key)) latestByPair.set(key, b.status as string); // desc 정렬이라 첫 항목=최신
  }

  const visible = convs.filter((c) => isVisibleTo(c, me, withBrief)); // 대화 있거나 상담정보 입력된 + 안 나간 방만
  await fillCounterpartInfo(visible); // 상대 이름·아바타 보강
  return visible.map((c) => ({
    ...c,
    status: deriveStatus(latestByPair.get(`${c.user_id}:${c.photographer_id}`)),
  }));
}

// 진행 중으로 볼 예약 상태 (거절/취소/환불 제외)
const LIVE_STATUSES = new Set([
  "requested", "accepted", "paid", "shot", "delivered", "completed",
]);

// 리스트에 보일지: 메시지가 한 번이라도 오갔거나(last_message_at) 상담 정보가 입력됐고,
// 내가 나간 시점 이후 활동이 있을 때. (둘 다 없는 빈 방은 작가·고객 양쪽에 숨김)
function isVisibleTo(c: ConversationListItem, me: CurrentUser, withBrief: Set<string>): boolean {
  if (!c.last_message_at) return withBrief.has(c.id); // 메시지 없으면 상담정보 있을 때만
  const myHidden = c.user_id === me.id ? c.user_hidden_at : c.photographer_hidden_at;
  return !myHidden || c.last_message_at > myHidden;
}

// 최근 활성 예약 상태 → 채팅방 진행 상태
function deriveStatus(status: string | undefined): ChatStatus {
  if (status === "shot" || status === "delivered" || status === "completed") return "shot";
  if (status === "accepted" || status === "paid") return "booked";
  return "consulting";
}

// 대화 1건 (접근 불가 시 null)
export async function getConversation(id: string): Promise<ConversationListItem | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id, user_id, photographer_id, last_message_at, user_unread, photographer_unread, " +
        "source_photo_path, " +
        "photographer:photographers(display_name, profile_id), " +
        "user:profiles!conversations_user_id_fkey(display_name)"
    )
    .eq("id", id)
    .maybeSingle();
  const conv = (data as unknown as ConversationListItem) ?? null;
  if (conv) await fillCounterpartInfo([conv]); // 상대 이름·아바타 보강
  return conv;
}

// 대화 메시지 목록
export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select(
      "id, sender_id, type, body, image_path, created_at, booking_id, " +
        "booking:bookings(id, status, shoot_at, location_text, amount_krw, travel_fee_krw, package_snapshot, package_id, memo, transfer_marked_at, proposed_by_photographer)"
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as ChatMessage[];
}

// 상담 정보(인테이크) — 대화별 1건. 고객이 작성, 작가가 열람.
export type ConsultationBrief = {
  conversation_id: string;
  gender: string | null;
  party_size: number | null;
  purpose: string | null;
  preferred_date: string | null;
  region: string | null;
  note: string | null;
  ref_image_paths: string[];
};

// 대화의 상담 정보 (RLS: 참여자만). 없으면 null.
export async function getBrief(conversationId: string): Promise<ConsultationBrief | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("consultation_briefs")
    .select(
      "conversation_id, gender, party_size, purpose, preferred_date, region, note, ref_image_paths"
    )
    .eq("conversation_id", conversationId)
    .maybeSingle();
  return (data as ConsultationBrief) ?? null;
}

// 대화 상대 표시명 (내 관점)
export function counterpartName(c: ConversationListItem, me: CurrentUser): string {
  if (c.user_id === me.id) {
    return c.photographer?.display_name || "작가";
  }
  return c.user?.display_name || "고객";
}

// 대화 상대 아바타 URL (내 관점) — 없으면 null로 이니셜 폴백
export function counterpartAvatar(c: ConversationListItem, me: CurrentUser): string | null {
  if (c.user_id === me.id) {
    return c.photographer_avatar_url ?? null; // 상대 = 작가
  }
  return c.user_avatar_url ?? null; // 상대 = 고객
}

// 내 안읽음 수 (내 관점)
export function myUnread(c: ConversationListItem, me: CurrentUser): number {
  return c.user_id === me.id ? c.user_unread : c.photographer_unread;
}

// 작가 시점 안읽은 문의 합계 (스튜디오 네비 배지)

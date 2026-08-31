import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/auth";

// 봇 수집 슬롯 — 작가용 문의 체크리스트 (conversations.bot_slots jsonb)
export type BotSlots = {
  purpose?: string;
  preferredDate?: string;
  region?: string;
  partySize?: string;
  custom?: Record<string, string>;
};

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
  bot_photo_id?: string | null; // 챗봇 문의 출발 사진 — 진행 중 방에서 봇 채팅 복귀용
  bot_slots?: BotSlots | null; // 봇이 수집한 문의 슬롯 — 작가용 체크리스트
  bot_disabled_at?: string | null; // 작가 첫 발화 시각 — 세팅되면 봇은 다시 발화하지 않는다(단방향)
  bot_handoff_notified_at?: string | null; // "작가님이 들어왔어요" 안내를 이미 게시했는지
  photographer: { display_name: string | null; profile_id?: string | null } | null;
  user: { display_name: string | null } | null;
  // 상대 아바타 — profiles는 RLS상 본인만 조회 가능해 admin으로 보강(아래 fillCounterpartInfo)
  user_avatar_url?: string | null;
  photographer_avatar_url?: string | null;
};

// 채팅방 진행 상태 — 세 가지뿐이다.
//
//   bot        챗봇이 응대 중 (작가가 아직 개입하지 않음)
//   consulting 작가가 이어받아 상담 중
//   booked     예약이 성사됨 (고객이 입금을 알린 뒤)
//
// **보는 사람에 따라 다르게 부른다.** 고객에게 '챗봇 상담중' 과 '작가 상담중' 을 나눠
// 보여줄 이유가 없다 — 누가 답하든 고객 입장에선 상담이 진행 중인 것이고,
// "지금 사람이 아니라 봇이 답하고 있다" 는 사실은 방 안에서 이미 드러난다.
// 작가·운영에게는 구분이 곧 할 일의 차이라(개입해야 하는가) 나눠서 보여준다.
export type ChatStatus = "bot" | "consulting" | "booked";
export type ChatViewer = "customer" | "photographer" | "admin";

const STATUS_LABEL_BY_VIEWER: Record<ChatViewer, Record<ChatStatus, string>> = {
  customer: { bot: "상담중", consulting: "상담중", booked: "예약 성사" },
  photographer: { bot: "챗봇 상담중", consulting: "상담중", booked: "예약 성사" },
  admin: { bot: "챗봇 상담중", consulting: "작가 상담중", booked: "예약 성사" },
};

export function chatStatusLabel(status: ChatStatus, viewer: ChatViewer): string {
  return STATUS_LABEL_BY_VIEWER[viewer][status];
}

/** 배지 색 — 손이 필요한 것(챗봇 상담중)과 끝난 것(예약 성사)이 구분돼야 한다 */
export function chatStatusTone(s: ChatStatus): "neutral" | "warning" | "success" {
  if (s === "booked") return "success";
  if (s === "bot") return "warning";
  return "neutral";
}

/** 어드민 필터용 — 표시 순서가 곧 진행 순서다 */
export const CHAT_STATUSES: ChatStatus[] = ["bot", "consulting", "booked"];
export type ChatRoomItem = ConversationListItem & { status: ChatStatus };

// 예약 제안 카드용 스냅샷 (편집 프리필을 위해 package_id·memo 포함)
export type BookingSnapshot = {
  id: string;
  status: string;
  shoot_at: string | null;
  shoot_date: string | null; // 시간 미정이어도 날짜만 확정한 제안
  location_text: string | null;
  amount_krw: number | null;
  travel_fee_krw: number;
  package_snapshot: { name?: string } | null;
  package_id: string | null;
  memo: string | null;
  custom_fields: unknown; // 작가 정의 추가 항목 값 스냅샷 (readStoredFieldValues 로 읽는다)
  transfer_marked_at: string | null; // 구매자가 송금 완료를 알린 시각
  late_booking_consent_at: string | null; // 임박 예약 환불불가 별도 동의 (docs/32 §1-1)
  contact_sent_at: string | null; // 작가가 연락처를 보낸 시각 (docs/32 §3-3)
  contact_delivered_at: string | null; // 고객이 고지·동의 후 받은 시각
  contact_payload: unknown; // 전달 시점 연락 수단 스냅샷
  proposed_by_photographer: boolean; // 작가가 제안한 건(=구매자가 수락 주체)
  settled_at: string | null; // 사매→작가 정산 송금 시각
  settlement_amount_krw: number | null; // 정산 송금액 (촬영비 − 수수료)
  settlement_ack_at: string | null; // 작가 [정산 받았어요]
  settlement_dispute_at: string | null; // 작가 [못 받았어요 — 확인 요청]
};

export type ChatMessage = {
  id: string;
  sender_id: string;
  type: "text" | "image" | "system" | "bot" | "summary_card";
  body: string;
  image_path: string | null;
  created_at: string;
  booking_id: string | null;
  booking?: BookingSnapshot | null;
};

const CONV_COLS =
  "id, user_id, photographer_id, last_message_at, user_unread, photographer_unread, " +
  "user_hidden_at, photographer_hidden_at, source_photo_path, bot_photo_id, bot_slots, " +
  "bot_disabled_at, bot_handoff_notified_at, " +
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
    .select("user_id, photographer_id, status, transfer_marked_at, created_at")
    .order("created_at", { ascending: false });
  const latestByPair = new Map<string, { status: string; transferMarkedAt: string | null }>();
  for (const b of bookings ?? []) {
    if (!LIVE_STATUSES.has(b.status as string)) continue;
    const key = `${b.user_id}:${b.photographer_id}`;
    // desc 정렬이라 첫 항목=최신
    if (!latestByPair.has(key))
      latestByPair.set(key, {
        status: b.status as string,
        transferMarkedAt: (b.transfer_marked_at as string) ?? null,
      });
  }

  const visible = convs.filter((c) => isVisibleTo(c, me, withBrief)); // 대화 있거나 상담정보 입력된 + 안 나간 방만
  await fillCounterpartInfo(visible); // 상대 이름·아바타 보강
  return visible.map((c) => {
    const bk = latestByPair.get(`${c.user_id}:${c.photographer_id}`);
    return {
      ...c,
      status: deriveChatStatus({
        botDisabledAt: c.bot_disabled_at,
        bookingStatus: bk?.status,
        transferMarkedAt: bk?.transferMarkedAt,
      }),
    };
  });
}

// 진행 중으로 볼 예약 상태 (거절/취소/환불 제외)
const LIVE_STATUSES = new Set([
  "requested", "accepted", "paid", "shot", "delivered", "completed",
]);

// 리스트에 보일지: 메시지가 한 번이라도 오갔거나(last_message_at) 상담 정보가 입력됐고,
// 내가 나간 시점 이후 활동이 있을 때. (둘 다 없는 빈 방은 작가·고객 양쪽에 숨김)
function isVisibleTo(c: ConversationListItem, me: CurrentUser, withBrief: Set<string>): boolean {
  // 메시지 없으면: 상담정보가 있거나, 내(고객)가 시작한 챗봇 문의 진행 중일 때만.
  // (작가에게는 여전히 숨김 — 수집이 끝나야 요약 카드와 함께 보인다)
  if (!c.last_message_at) return withBrief.has(c.id) || (c.bot_photo_id != null && c.user_id === me.id);
  const myHidden = c.user_id === me.id ? c.user_hidden_at : c.photographer_hidden_at;
  return !myHidden || c.last_message_at > myHidden;
}

/**
 * 방의 진행 상태 — 예약이 있으면 예약이, 없으면 봇 인계 여부가 결정한다.
 *
 * '예약 성사' 의 기준은 **고객이 입금을 알린 시점**이다. 수락만 된 건은 아직 성사가 아니라
 * 입금 대기이고, 그 구간에서 '성사' 로 보이면 작가가 준비를 시작해버린다.
 */
export function deriveChatStatus(params: {
  botDisabledAt: string | null | undefined;
  bookingStatus?: string | null;
  transferMarkedAt?: string | null;
}): ChatStatus {
  const s = params.bookingStatus;
  const paid = s === "paid" || s === "shot" || s === "delivered" || s === "completed";
  if (paid || (s === "accepted" && params.transferMarkedAt)) return "booked";
  return params.botDisabledAt ? "consulting" : "bot";
}

// 대화 1건 (접근 불가 시 null)
export async function getConversation(id: string): Promise<ConversationListItem | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id, user_id, photographer_id, last_message_at, user_unread, photographer_unread, " +
        "source_photo_path, bot_photo_id, bot_slots, " +
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
        "booking:bookings(id, status, shoot_at, shoot_date, location_text, amount_krw, travel_fee_krw, package_snapshot, package_id, memo, custom_fields, transfer_marked_at, late_booking_consent_at, contact_sent_at, contact_delivered_at, contact_payload, proposed_by_photographer, settled_at, settlement_amount_krw, settlement_ack_at, settlement_dispute_at)"
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

/**
 * 고객 시점 안읽은 메시지 합계 — 하단 내비 '문의' 배지.
 *
 * 목록 페이지를 열기 전에도 "새 답장이 왔다" 를 알아야 한다. 알림을 놓친 사용자에게
 * 다시 들어올 이유를 주는 건 이 숫자뿐이다.
 * 숨긴 방은 세지 않는다 — 목록에 없는 방의 배지는 눌러도 갈 곳이 없다.
 */
export async function fetchUnreadTotalForUser(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("conversations")
    .select("user_unread")
    .eq("user_id", userId)
    .is("user_hidden_at", null);
  return ((data ?? []) as { user_unread: number | null }[]).reduce(
    (sum, c) => sum + (c.user_unread ?? 0),
    0
  );
}

/**
 * 작가 시점 안읽은 메시지 합계 — 하단 내비 '스튜디오' 배지.
 *
 * 작가는 스튜디오 밖(홈·탐색)에서도 답장이 왔는지 알아야 한다. 고객은 답이 늦으면
 * 그냥 다른 작가에게 간다 — 이 숫자가 늦는 만큼 거래가 샌다.
 * 숨긴 방은 세지 않는다 (목록에 없는 방의 배지는 눌러도 갈 곳이 없다).
 */
export async function fetchUnreadTotalForPhotographer(photographerId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("conversations")
    .select("photographer_unread")
    .eq("photographer_id", photographerId)
    .is("photographer_hidden_at", null);
  return ((data ?? []) as { photographer_unread: number | null }[]).reduce(
    (sum, c) => sum + (c.photographer_unread ?? 0),
    0
  );
}

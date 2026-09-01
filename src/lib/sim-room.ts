import "server-only";

// 어드민 채팅방 시뮬레이터의 데이터 계층.
//
// 브라우저 하나로 두 사람이 동시에 로그인할 수는 없다(쿠키를 공유한다).
// 그래서 시뮬레이터는 로그인을 흉내내지 않고, **어드민 권한으로 양쪽을 대신 조작한다.**
// 대화·메시지·예약은 전부 진짜 테이블에 들어가므로, 봇 응답도 검열도 실제와 같게 돈다.
//
// 조작 대상은 역할극 테스트 계정으로 못박는다 — 실사용자 방을 시뮬레이터로 건드릴 수 없다.

import { createAdminClient } from "@/lib/supabase/admin";
import { seedBotRoomMessages } from "@/lib/inquiry-bot-room";
import { resolveGreeting } from "@/lib/bot-kb-db";
import { handlePhotographerTakeover } from "@/lib/bot-handoff";
import { runBotTurn } from "@/lib/bot-turn";
import type { ChatMessage } from "@/lib/chat";

/** 시뮬레이터가 조작할 수 있는 유일한 고객 — 실사용자 계정은 대상이 되지 않는다 */
export const SIM_CUSTOMER_EMAIL = "roleplay-customer@samae.test";

export type SimPhotographer = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  profileId: string;
  /** 고객 첫 화면(작가 상세)에 쓸 대표 사진 */
  photoId: string | null;
  photoUrl: string | null;
  priceFromKrw: number;
  regions: string[];
};

export type SimState = {
  customer: { id: string; displayName: string };
  photographer: SimPhotographer | null;
  photographers: { id: string; displayName: string }[];
  conversationId: string | null;
  messages: ChatMessage[];
  /** 작가가 이어받았는가 — 이어받으면 봇은 다시 켜지지 않는다 */
  handedOff: boolean;
};

const MSG_COLS = "id, sender_id, type, body, image_path, created_at, booking_id";

/** 시뮬레이터 고객 계정 — 없으면 null (역할극 계정이 안 깔린 환경) */
async function findSimCustomer(): Promise<{ id: string; displayName: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = data?.users?.find((u) => u.email === SIM_CUSTOMER_EMAIL);
  if (!user) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  return { id: user.id, displayName: (profile?.display_name as string) ?? "테스트 고객" };
}

async function loadPhotographer(id: string): Promise<SimPhotographer | null> {
  const admin = createAdminClient();
  const { data: ph } = await admin
    .from("photographers")
    .select("id, display_name, profile_id, price_from_krw, regions, hero_photo_id")
    .eq("id", id)
    .maybeSingle();
  if (!ph) return null;

  const [{ data: profile }, { data: photo }] = await Promise.all([
    admin.from("profiles").select("avatar_url").eq("id", ph.profile_id).maybeSingle(),
    // 대표 사진이 없으면 그 작가의 아무 공개 사진이나 — 첫 화면이 비면 시작점이 안 된다
    admin
      .from("photos")
      .select("id, thumb_url, src_url")
      .eq("photographer_id", id)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    id: ph.id as string,
    displayName: (ph.display_name as string) ?? "작가",
    avatarUrl: (profile?.avatar_url as string | null) ?? null,
    profileId: ph.profile_id as string,
    photoId: (photo?.id as string) ?? null,
    photoUrl: (photo?.thumb_url as string) ?? (photo?.src_url as string) ?? null,
    priceFromKrw: (ph.price_from_krw as number) ?? 0,
    regions: (ph.regions as string[]) ?? [],
  };
}

/** 시뮬레이터 화면이 필요한 모든 상태를 한 번에 */
export async function loadSimState(photographerId?: string | null): Promise<SimState> {
  const admin = createAdminClient();
  const customer = await findSimCustomer();

  const { data: list } = await admin
    .from("photographers")
    .select("id, display_name")
    .eq("status", "approved")
    .order("display_name", { ascending: true });
  const photographers = ((list ?? []) as { id: string; display_name: string | null }[]).map((p) => ({
    id: p.id,
    displayName: p.display_name ?? "이름 없음",
  }));

  const targetId = photographerId || photographers[0]?.id || null;
  const photographer = targetId ? await loadPhotographer(targetId) : null;

  if (!customer || !photographer) {
    return {
      customer: customer ?? { id: "", displayName: "테스트 고객 없음" },
      photographer,
      photographers,
      conversationId: null,
      messages: [],
      handedOff: false,
    };
  }

  const { data: conv } = await admin
    .from("conversations")
    .select("id, bot_disabled_at")
    .eq("user_id", customer.id)
    .eq("photographer_id", photographer.id)
    .maybeSingle();

  let messages: ChatMessage[] = [];
  if (conv) {
    const { data } = await admin
      .from("messages")
      .select(MSG_COLS)
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(200);
    messages = (data ?? []) as unknown as ChatMessage[];
  }

  return {
    customer,
    photographer,
    photographers,
    conversationId: (conv?.id as string) ?? null,
    messages,
    handedOff: !!conv?.bot_disabled_at,
  };
}

/** 고객이 [작가 상담하기] 를 누른 것 — 방을 만들고 봇 인사를 시드한다 */
export async function simStartChat(photographerId: string): Promise<string | null> {
  const admin = createAdminClient();
  const customer = await findSimCustomer();
  const photographer = await loadPhotographer(photographerId);
  if (!customer || !photographer) return null;

  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("user_id", customer.id)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  let convId = (existing?.id as string) ?? null;
  if (!convId) {
    const { data: created } = await admin
      .from("conversations")
      .insert({
        user_id: customer.id,
        photographer_id: photographerId,
        bot_photo_id: photographer.photoId,
      })
      .select("id")
      .single();
    convId = (created?.id as string) ?? null;
  }
  if (!convId) return null;

  // 시드는 멱등하다 — 이미 대화가 있으면 건너뛴다
  await seedBotRoomMessages({
    conversationId: convId,
    customerId: customer.id,
    photographerProfileId: photographer.profileId,
    photographerName: photographer.displayName,
    photo: { thumbUrl: photographer.photoUrl },
    firstQuestion: "",
    qaMode: true,
    greeting: await resolveGreeting(photographerId, photographer.displayName),
  });
  return convId;
}

/** 고객이 한 마디 — 봇이 살아 있으면 봇이 받고, 인계된 뒤면 평범한 채팅이 된다 */
export async function simCustomerSay(conversationId: string, text: string): Promise<string | null> {
  const customer = await findSimCustomer();
  if (!customer) return "테스트 고객 계정이 없어요.";
  const res = await runBotTurn(conversationId, text, customer.id);
  if (!res.ok && res.blocked) return res.reason; // 검열에 걸림 — 실제 화면과 같은 문구
  return null;
}

/** 작가가 한 마디 — 첫 발화면 봇이 물러난다(인계) */
export async function simPhotographerSay(conversationId: string, text: string): Promise<void> {
  const admin = createAdminClient();
  const body = text.trim().slice(0, 2000);
  if (!body) return;

  const { data: conv } = await admin
    .from("conversations")
    .select("photographer_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return;
  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", conv.photographer_id)
    .maybeSingle();
  if (!ph?.profile_id) return;

  // 인계 안내가 작가 첫 마디보다 뒤에 붙으면 순서가 뒤집힌다 — 넣기 전에 부른다
  await handlePhotographerTakeover(admin, conversationId, ph.profile_id as string);
  await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: ph.profile_id,
    type: "text",
    body,
  });
}

/**
 * 처음 상태로 — 대화·메시지·예약을 지운다.
 *
 * 대화 행 자체도 지운다(스크립트와 다른 점): 시뮬레이터의 시작점은
 * "고객이 작가 상세를 보고 있는 화면" 이라 방이 없는 상태여야 한다.
 */
export async function simReset(photographerId: string): Promise<void> {
  const admin = createAdminClient();
  const customer = await findSimCustomer();
  if (!customer) return;

  const { data: convs } = await admin
    .from("conversations")
    .select("id")
    .eq("user_id", customer.id)
    .eq("photographer_id", photographerId);
  const convIds = (convs ?? []).map((c) => c.id as string);

  // 메시지가 예약을 참조하므로 메시지 → 예약 순서로 지운다
  if (convIds.length > 0) {
    await admin.from("messages").delete().in("conversation_id", convIds);
    await admin.from("bot_open_questions").delete().in("conversation_id", convIds);
    await admin.from("moderation_events").delete().in("conversation_id", convIds);
  }

  const { data: bookings } = await admin
    .from("bookings")
    .select("id")
    .eq("user_id", customer.id)
    .eq("photographer_id", photographerId);
  const bookingIds = (bookings ?? []).map((b) => b.id as string);
  if (bookingIds.length > 0) {
    await admin.from("platform_fees").delete().in("booking_id", bookingIds);
    await admin.from("payments").delete().in("booking_id", bookingIds);
    if (convIds.length > 0)
      await admin.from("conversations").update({ booking_id: null }).in("id", convIds);
    await admin.from("bookings").delete().in("id", bookingIds);
  }

  if (convIds.length > 0) await admin.from("conversations").delete().in("id", convIds);
  await admin.from("notifications").delete().eq("recipient_id", customer.id);
}

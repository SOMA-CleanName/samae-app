"use server";

// 연락처 전달 (docs/32 §3-3).
//
// 작가가 보내고 → 고객이 고지를 읽고 동의해야 받는다. 두 단계를 나눈 이유:
// 연락처가 넘어가면 거래는 사매 밖에서도 이어질 수 있고, 그때부터 무슨 일이 있었는지
// 추적할 수 없다. 그래서 이 전달이 곧 사매 중개 용역의 제공 완료 지점이고,
// 그 시점부터 청약철회 100% 구간이 닫힌다.
//
// 근거로 쓰려면 '무엇을 언제 고지했고 언제 동의받았는지' 가 남아야 한다.
// 시간이 지나면 저절로 열리는 방식으로는 그 기록이 만들어지지 않는다.

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeContactMethods, type ContactMethod } from "@/lib/photographer-contacts";

/** 연락처를 건넬 수 있는 단계 — 입금이 확인된 뒤에만 */
const DELIVERABLE = ["paid", "shot", "delivered", "completed"];

/** 작가: 등록해둔 연락 수단을 이 예약의 고객에게 보낸다 */
export async function sendPhotographerContact(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 보낼 수 있어요.");
  const bookingId = String(formData.get("id"));

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, photographer_id, user_id, contact_sent_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");
  if (b.photographer_id !== me.photographer.id) throw new Error("이 예약의 작가가 아니에요.");
  if (!DELIVERABLE.includes(b.status as string))
    throw new Error("입금이 확인된 뒤에 보낼 수 있어요.");

  const { data: ph } = await admin
    .from("photographers")
    .select("contact_methods")
    .eq("id", me.photographer.id)
    .maybeSingle();
  const methods: ContactMethod[] = normalizeContactMethods(ph?.contact_methods);
  if (methods.length === 0)
    throw new Error("먼저 스튜디오 프로필에서 연락 수단을 등록해주세요.");

  // 전달 당시의 값을 굳힌다 — 나중에 프로필을 바꿔도 무엇을 줬는지는 남아야 한다
  await admin
    .from("bookings")
    .update({ contact_sent_at: new Date().toISOString(), contact_payload: methods })
    .eq("id", bookingId);

  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (conv) {
    // 대화의 한 사건이므로 타임라인에 말풍선으로 남긴다.
    // 예약 카드 안에만 두면 대화가 몇 줄만 쌓여도 위로 밀려 안 보인다.
    // body 에 예약 id 를 실어 카드가 어느 예약의 전달인지 알게 한다.
    await admin.from("messages").insert({
      conversation_id: conv.id,
      sender_id: b.user_id, // 카드형이라 좌우 정렬에 쓰이지 않는다
      type: "contact_card",
      body: bookingId,
      booking_id: bookingId,
    });
    revalidatePath(`/chat/${conv.id}`);
  }

  await admin.from("notifications").insert({
    recipient_id: b.user_id,
    type: "booking",
    title: "작가님이 연락처를 보냈어요",
    body: "받기 전에 환불 정책 변경 안내를 확인해주세요.",
    link: `/bookings/${bookingId}`,
  });

  revalidatePath("/studio/bookings");
}

/**
 * 고객: 고지를 확인하고 연락처를 받는다.
 *
 * 이 시각이 청약철회 구간을 닫는다 — 그래서 화면에서 무엇이 달라지는지 먼저 보여주고,
 * 누른 사람이 고객 본인인지 서버에서 다시 확인한다.
 */
export async function acceptPhotographerContact(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");
  const bookingId = String(formData.get("id"));

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, user_id, contact_sent_at, contact_delivered_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");
  if (b.user_id !== me.id) throw new Error("고객 본인만 받을 수 있어요.");
  if (!b.contact_sent_at) throw new Error("아직 작가님이 연락처를 보내지 않았어요.");
  if (b.contact_delivered_at) return; // 멱등 — 첫 수령 시각을 유지한다

  await admin
    .from("bookings")
    .update({ contact_delivered_at: new Date().toISOString() })
    .eq("id", bookingId)
    .is("contact_delivered_at", null);

  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (conv) {
    // 교환 사실을 대화에도 남긴다 — 분쟁에서 '언제부터 밖에서 이야기했는지' 의 기준
    await admin
      .from("conversations")
      .update({ contact_exchanged_at: new Date().toISOString() })
      .eq("id", conv.id)
      .is("contact_exchanged_at", null);
    revalidatePath(`/chat/${conv.id}`);
  }
}

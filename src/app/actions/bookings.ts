"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

// 알림 생성 헬퍼 (service_role)
async function notify(
  admin: ReturnType<typeof createAdminClient>,
  recipientId: string,
  title: string,
  body: string,
  link: string
) {
  await admin.from("notifications").insert({
    recipient_id: recipientId,
    type: "booking",
    title,
    body,
    link,
  });
}

// 대화에 시스템 메시지 1건 (예약 진행상황 공유). 메시지 트리거가 알림·안읽음 처리.
async function postSystemMessage(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  photographerId: string,
  senderId: string,
  body: string,
  bookingId?: string
) {
  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("photographer_id", photographerId)
    .maybeSingle();
  if (!conv) return;
  await admin.from("messages").insert({
    conversation_id: conv.id,
    sender_id: senderId,
    type: "system",
    body,
    booking_id: bookingId ?? null,
  });
}

// ── 예약 제안 (구매자/작가 양측, 채팅 내 템플릿 작성 → 제안) ────────────
// 당사자는 conversation에서 도출(폼의 photographerId는 신뢰하지 않음).
// 작가가 제안하는 경우 user_id가 본인이 아니라 RLS insert(check user_id=auth.uid())에
// 막히므로, 참여자 검증 후 admin(service_role)으로 삽입한다.
export async function proposeBooking(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const conversationId = String(formData.get("conversationId"));
  const packageId = String(formData.get("packageId"));
  const shootAtRaw = String(formData.get("shootAt") || "");
  const locationText = String(formData.get("locationText") || "").slice(0, 200);
  const memo = String(formData.get("memo") || "").slice(0, 500);
  const wantTravel = formData.get("travel") === "on";

  const supabase = await createClient();

  // 대화에서 당사자 도출 + 참여자 검증 (양측 RLS로 조회 가능)
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, user_id, photographer_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) throw new Error("대화를 찾을 수 없습니다.");
  const amCustomer = conv.user_id === me.id;
  const amPhotographer = me.photographer?.id === conv.photographer_id;
  if (!amCustomer && !amPhotographer) throw new Error("권한이 없습니다.");

  const photographerId = conv.photographer_id;
  const userId = conv.user_id;

  // 패키지 스냅샷 + 작가 출장비
  const [{ data: pkg }, { data: phRow }] = await Promise.all([
    supabase
      .from("packages")
      .select("name, description, price_krw, duration_min, edited_count")
      .eq("id", packageId)
      .single(),
    supabase.from("photographers").select("travel_fee_krw").eq("id", photographerId).single(),
  ]);
  if (!pkg) throw new Error("패키지를 찾을 수 없습니다.");

  const travelFee = wantTravel ? Math.max(0, phRow?.travel_fee_krw ?? 0) : 0;
  const amount = pkg.price_krw + travelFee;

  // 희망 시각 (없으면 협의). 유효하지 않으면 null.
  let shootAt: string | null = null;
  if (shootAtRaw) {
    const d = new Date(shootAtRaw);
    if (!isNaN(d.getTime())) shootAt = d.toISOString();
  }

  // 양측 제안을 지원하려면 admin 삽입(작가 제안 시 user_id ≠ auth.uid())
  const admin = createAdminClient();
  const { data: booking, error } = await admin
    .from("bookings")
    .insert({
      user_id: userId,
      photographer_id: photographerId,
      package_id: packageId,
      status: "requested",
      shoot_at: shootAt,
      duration_min: pkg.duration_min ?? null,
      location_text: locationText,
      amount_krw: amount,
      travel_fee_krw: travelFee,
      package_snapshot: pkg,
      memo,
      proposed_by_photographer: amPhotographer,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // 대화에 예약 제안 카드 메시지 + 대화-예약 연결
  await admin.from("conversations").update({ booking_id: booking.id }).eq("id", conversationId);
  await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: me.id,
    type: "system",
    body: amPhotographer ? "📋 작가가 예약을 제안했어요" : "📋 예약을 제안했어요",
    booking_id: booking.id,
  });

  redirect(`/chat/${conversationId}`);
}

// ── 예약 제안 수정 (구매자, requested 상태에서만) ────────────────
export async function updateBooking(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const id = String(formData.get("id"));
  const conversationId = String(formData.get("conversationId"));
  const packageId = String(formData.get("packageId"));
  const shootAtRaw = String(formData.get("shootAt") || "");
  const locationText = String(formData.get("locationText") || "").slice(0, 200);
  const memo = String(formData.get("memo") || "").slice(0, 500);
  const wantTravel = formData.get("travel") === "on";

  const admin = createAdminClient();

  // 본인 + requested 상태만 수정 가능
  const { data: b } = await admin
    .from("bookings")
    .select("id, user_id, photographer_id, status")
    .eq("id", id)
    .single();
  if (!b || b.user_id !== me.id) throw new Error("권한이 없습니다.");
  if (b.status !== "requested") throw new Error("수정할 수 없는 상태입니다.");

  // 패키지 스냅샷 + 작가 출장비 재계산
  const [{ data: pkg }, { data: phRow }] = await Promise.all([
    admin
      .from("packages")
      .select("name, description, price_krw, duration_min, edited_count")
      .eq("id", packageId)
      .single(),
    admin.from("photographers").select("travel_fee_krw").eq("id", b.photographer_id).single(),
  ]);
  if (!pkg) throw new Error("패키지를 찾을 수 없습니다.");

  const travelFee = wantTravel ? Math.max(0, phRow?.travel_fee_krw ?? 0) : 0;
  const amount = pkg.price_krw + travelFee;

  let shootAt: string | null = null;
  if (shootAtRaw) {
    const d = new Date(shootAtRaw);
    if (!isNaN(d.getTime())) shootAt = d.toISOString();
  }

  const { error } = await admin
    .from("bookings")
    .update({
      package_id: packageId,
      shoot_at: shootAt,
      duration_min: pkg.duration_min ?? null,
      location_text: locationText,
      amount_krw: amount,
      travel_fee_krw: travelFee,
      package_snapshot: pkg,
      memo,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // 시스템 안내 메시지 (카드는 기존 메시지가 갱신된 booking을 다시 보여줌)
  await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: me.id,
    type: "system",
    body: "✏️ 예약 제안을 수정했어요",
  });

  redirect(`/chat/${conversationId}`);
}

// ── 상태 전이 (service_role + 권한·상태 검증) ────────────────────

// 요청 수락 → accepted + 슬롯 예약.
// 수락 주체는 '제안자의 상대' — 구매자 제안이면 작가가, 작가 제안이면 구매자가 수락한다.
export async function acceptBooking(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id, status, photographer_id, user_id, shoot_at, duration_min, package_snapshot, proposed_by_photographer"
    )
    .eq("id", id)
    .single();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");
  if (b.status !== "requested") throw new Error("수락할 수 없는 상태입니다.");

  // 수락 권한: 작가 제안 → 구매자가, 구매자 제안 → 작가가
  const accepterIsCustomer = b.proposed_by_photographer;
  if (accepterIsCustomer) {
    if (b.user_id !== me.id) throw new Error("권한이 없습니다.");
  } else if (me.photographer?.id !== b.photographer_id) {
    throw new Error("권한이 없습니다.");
  }

  // 시간 충돌 검사 — 이미 점유된 예약과 겹치면 거부 (시각이 정해진 경우만)
  if (b.shoot_at) {
    const dur =
      b.duration_min ??
      (b.package_snapshot as { duration_min?: number } | null)?.duration_min ??
      60;
    const start = new Date(b.shoot_at).getTime();
    const end = start + dur * 60000;

    const { data: others } = await admin
      .from("bookings")
      .select("shoot_at, duration_min, package_snapshot")
      .eq("photographer_id", b.photographer_id)
      .in("status", ["accepted", "paid", "shot", "delivered", "completed"])
      .not("shoot_at", "is", null)
      .neq("id", id);

    const conflict = (others ?? []).some((o) => {
      const od =
        o.duration_min ??
        (o.package_snapshot as { duration_min?: number } | null)?.duration_min ??
        60;
      const os = new Date(o.shoot_at as string).getTime();
      return start < os + od * 60000 && end > os;
    });
    if (conflict) throw new Error("해당 시간에 이미 다른 예약이 있어요.");
  }

  await admin
    .from("bookings")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", id);

  // 제안자(상대)에게 알림
  const proposerId = accepterIsCustomer
    ? (await admin.from("photographers").select("profile_id").eq("id", b.photographer_id).single())
        .data?.profile_id
    : b.user_id;
  if (proposerId)
    await notify(admin, proposerId, "예약이 수락됐어요", "예약이 체결되었습니다.", `/bookings/${id}`);
  await postSystemMessage(admin, b.user_id, b.photographer_id, me.id, "✅ 예약이 수락되어 체결되었어요.");
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
  revalidatePath("/chat");
}

// 요청 거절 — 수락과 동일하게 '제안자의 상대'가 거절한다.
export async function rejectBooking(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("status, photographer_id, user_id, proposed_by_photographer")
    .eq("id", id)
    .single();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");
  if (b.status !== "requested") throw new Error("거절할 수 없는 상태입니다.");

  const rejecterIsCustomer = b.proposed_by_photographer;
  if (rejecterIsCustomer) {
    if (b.user_id !== me.id) throw new Error("권한이 없습니다.");
  } else if (me.photographer?.id !== b.photographer_id) {
    throw new Error("권한이 없습니다.");
  }

  await admin.from("bookings").update({ status: "rejected" }).eq("id", id);

  // 제안자(상대)에게 알림
  const proposerId = rejecterIsCustomer
    ? (await admin.from("photographers").select("profile_id").eq("id", b.photographer_id).single())
        .data?.profile_id
    : b.user_id;
  if (proposerId)
    await notify(admin, proposerId, "예약이 거절됐어요", "다른 조건으로 다시 제안해보세요.", `/bookings/${id}`);
  await postSystemMessage(admin, b.user_id, b.photographer_id, me.id, "❌ 예약 제안이 거절되었어요.");
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
  revalidatePath("/chat");
}

// 구매자/작가: 결제 전 취소 → 슬롯 해제
export async function cancelBooking(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("status, photographer_id, user_id")
    .eq("id", id)
    .single();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");

  const isBuyer = b.user_id === me.id;
  const isOwner = me.photographer?.id === b.photographer_id;
  if (!isBuyer && !isOwner) throw new Error("권한이 없습니다.");
  if (!["requested", "accepted"].includes(b.status)) throw new Error("취소할 수 없는 상태입니다.");

  await admin
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id);

  // 상대에게 알림
  const recipient = isBuyer
    ? (await admin.from("photographers").select("profile_id").eq("id", b.photographer_id).single()).data?.profile_id
    : b.user_id;
  if (recipient) await notify(admin, recipient, "예약이 취소됐어요", "", `/bookings/${id}`);

  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
}

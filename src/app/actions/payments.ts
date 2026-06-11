"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { confirmBankTransfer, waiveFee, ensureTransferRecord } from "@/lib/payments";
import { DELIVERY_BUCKET, deliveryAssetName } from "@/lib/deliveries";

// 알림 헬퍼 (service_role)
async function notify(
  admin: ReturnType<typeof createAdminClient>,
  recipientId: string,
  title: string,
  body: string,
  link: string,
  type: "booking" | "payment" | "settlement" = "booking"
) {
  await admin.from("notifications").insert({ recipient_id: recipientId, type, title, body, link });
}

// 해당 유저↔작가 대화에 시스템 메시지 1건 (예약 진행 기록). 트리거가 알림·안읽음 처리.
async function postSystemMessage(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  photographerId: string,
  senderId: string,
  body: string
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
  });
}

function revalidateBooking(id: string) {
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
}

// ── 송금 완료 알림 (구매자) : accepted 유지 + 작가에게 확인 요청 ──────────
// 사용자가 작가 계좌로 송금한 뒤 [송금 완료]를 누르면 호출. 상태는 바꾸지 않고
// (실제 paid 전이는 작가 confirmTransfer가 담당) 작가에게 입금 확인을 재촉한다.
export async function markTransferSent(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const admin = createAdminClient();
  // 본인 + accepted + 아직 미표시일 때만 1회 (멱등 — 중복 알림 방지)
  const { data: moved } = await admin
    .from("bookings")
    .update({ transfer_marked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", me.id)
    .eq("status", "accepted")
    .is("transfer_marked_at", null)
    .select("id, photographer_id, user_id, amount_krw");
  if (!moved || moved.length === 0) {
    revalidateBooking(id); // 이미 표시됐거나 상태가 다름 — 조용히 갱신만
    return;
  }
  const b = moved[0];

  // 송금 대기 결제 레코드 보장(멱등)
  await ensureTransferRecord(id, b.amount_krw ?? 0);

  // 작가에게 알림 (+ 고객 이름)
  const [{ data: ph }, { data: prof }] = await Promise.all([
    admin.from("photographers").select("profile_id").eq("id", b.photographer_id).single(),
    admin.from("profiles").select("display_name").eq("id", b.user_id).single(),
  ]);
  const who = prof?.display_name || "고객";
  if (ph)
    await notify(
      admin,
      ph.profile_id,
      "송금 완료 알림",
      `${who}님이 송금을 완료했어요. 입금을 확인해주세요.`,
      `/bookings/${id}`,
      "payment"
    );

  // 채팅 타임라인 기록
  await postSystemMessage(
    admin,
    b.user_id,
    b.photographer_id,
    b.user_id,
    "💸 송금을 완료했어요. 작가님의 입금 확인을 기다립니다."
  );

  revalidateBooking(id);
}

// ── 입금 확인 (작가) : accepted → paid + 플랫폼 수수료 발생 ──────────────
// 사용자가 작가 계좌로 직접 송금한 것을 작가가 확인하면 호출. 머니패스의 신뢰 시점.
export async function confirmTransfer(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");

  const result = await confirmBankTransfer(id, me.photographer.id);
  if (!result.ok) throw new Error("처리할 수 없는 상태입니다.");

  revalidateBooking(id);
  revalidatePath("/studio/settlements");
}

// ── 촬영 완료 표시 (작가) : paid → shot ─────────────────────────────
export async function markShot(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");

  const admin = createAdminClient();
  const { data: moved } = await admin
    .from("bookings")
    .update({ status: "shot", shot_at: new Date().toISOString() })
    .eq("id", id)
    .eq("photographer_id", me.photographer.id)
    .eq("status", "paid")
    .select("id, user_id");
  if (!moved || moved.length === 0) throw new Error("처리할 수 없는 상태입니다.");

  await notify(admin, moved[0].user_id, "촬영이 완료됐어요", "보정본 전달을 기다려주세요.", `/bookings/${id}`);
  revalidateBooking(id);
}

// ── 보정본 전달 완료 (작가) : paid/shot → completed ─────────────────
// 앱 내 업로드(deliveries.asset_paths) 또는 외부 링크로 전달하고 거래를 마무리한다.
// 직접이체 모델 + 사용자 수신확인 생략(요구사항) → delivered 단계를 건너뛰고 바로 완료.
// 채팅에 완료 안내를 남겨 후기 작성을 유도한다.
export async function deliverFinals(formData: FormData) {
  const id = String(formData.get("id"));
  const externalLink = String(formData.get("externalLink") || "").trim().slice(0, 500);
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");

  const admin = createAdminClient();

  // 소유 + 결제 이후 단계만
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, user_id, photographer_id")
    .eq("id", id)
    .single();
  if (!b || b.photographer_id !== me.photographer.id) throw new Error("권한이 없습니다.");
  if (!["paid", "shot"].includes(b.status)) throw new Error("전달할 수 없는 상태입니다.");

  // 전달물 확인 — 업로드 파일 또는 외부 링크 중 하나는 있어야 함
  const { data: delivery } = await admin
    .from("deliveries")
    .select("asset_paths")
    .eq("booking_id", id)
    .maybeSingle();
  const hasFiles = (delivery?.asset_paths?.length ?? 0) > 0;
  if (!hasFiles && !externalLink) throw new Error("보정본 파일이나 전달 링크를 먼저 등록해주세요.");

  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 30 * 864e5).toISOString(); // 30일 후 만료

  // 전달 레코드 마무리 (외부 링크·만료 기록)
  await admin
    .from("deliveries")
    .upsert(
      { booking_id: id, external_link: externalLink || null, expires_at: expires },
      { onConflict: "booking_id" }
    );

  // 거래 완료 전이 (사용자 확인 생략)
  await admin
    .from("bookings")
    .update({ status: "completed", delivered_at: now, completed_at: now })
    .eq("id", id);

  // 채팅 완료 안내 + 알림 (후기 유도는 카드가 담당)
  await postSystemMessage(
    admin,
    b.user_id,
    b.photographer_id,
    me.id,
    "📸 보정본 전달까지 완료되었습니다! 촬영은 어떠셨나요? 후기를 남겨주세요."
  );
  await notify(
    admin,
    b.user_id,
    "보정본이 전달됐어요",
    "보정본을 확인하고 후기를 남겨주세요.",
    `/bookings/${id}`
  );

  revalidateBooking(id);
}

// ── 보정본 파일 삭제 (작가) : 잘못 올린 파일 제거 ──────────────────
// 전달 전(paid/shot)뿐 아니라 완료 후(completed) 교체도 허용한다(대처).
export async function removeDeliveryAsset(bookingId: string, path: string) {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("photographer_id, status")
    .eq("id", bookingId)
    .single();
  if (!b || b.photographer_id !== me.photographer.id) throw new Error("권한이 없습니다.");
  if (!["paid", "shot", "completed"].includes(b.status)) {
    throw new Error("변경할 수 없는 상태입니다.");
  }
  // 다른 예약 폴더 접근 방지
  if (!path.startsWith(`${bookingId}/`)) throw new Error("잘못된 경로입니다.");

  const { data: d } = await admin
    .from("deliveries")
    .select("asset_paths")
    .eq("booking_id", bookingId)
    .maybeSingle();
  const nextPaths = (d?.asset_paths ?? []).filter((p: string) => p !== path);

  await admin.storage.from(DELIVERY_BUCKET).remove([path]);
  await admin
    .from("deliveries")
    .upsert({ booking_id: bookingId, asset_paths: nextPaths }, { onConflict: "booking_id" });

  revalidateBooking(bookingId);
  return nextPaths.map((p: string) => ({ path: p, name: deliveryAssetName(p) }));
}

// ── 보정본 재전달 알림 (작가) : 완료 후 파일 교체 뒤 고객에게 재알림 ──
export async function redeliverNotify(formData: FormData) {
  const id = String(formData.get("id"));
  const externalLink = String(formData.get("externalLink") || "").trim().slice(0, 500);
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("user_id, photographer_id, status")
    .eq("id", id)
    .single();
  if (!b || b.photographer_id !== me.photographer.id) throw new Error("권한이 없습니다.");
  if (b.status !== "completed") throw new Error("완료된 예약만 재전달할 수 있어요.");

  const { data: d } = await admin
    .from("deliveries")
    .select("asset_paths")
    .eq("booking_id", id)
    .maybeSingle();
  const hasFiles = (d?.asset_paths?.length ?? 0) > 0;
  if (!hasFiles && !externalLink) throw new Error("보정본 파일이나 링크를 먼저 등록해주세요.");

  await admin
    .from("deliveries")
    .upsert({ booking_id: id, external_link: externalLink || null }, { onConflict: "booking_id" });
  await postSystemMessage(
    admin,
    b.user_id,
    b.photographer_id,
    me.id,
    "📸 보정본을 다시 전달했어요. 업데이트된 파일을 확인해주세요."
  );
  await notify(admin, b.user_id, "보정본이 업데이트됐어요", "변경된 보정본을 확인해주세요.", `/bookings/${id}`);

  revalidateBooking(id);
}

// ── 보정본 전달 표시 (작가) : shot → delivered ──────────────────────
// (구 흐름) 사용자 확인 단계를 거치는 전달. 신규는 deliverFinals 사용.
export async function markDelivered(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");

  const admin = createAdminClient();
  const { data: moved } = await admin
    .from("bookings")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", id)
    .eq("photographer_id", me.photographer.id)
    .eq("status", "shot")
    .select("id, user_id");
  if (!moved || moved.length === 0) throw new Error("처리할 수 없는 상태입니다.");

  await notify(admin, moved[0].user_id, "보정본이 전달됐어요", "확인 후 거래를 완료해주세요.", `/bookings/${id}`);
  revalidateBooking(id);
}

// ── 전달 확인 (구매자) : delivered → completed ──────────────────────
// 직접이체 모델에서는 정산 보류/예약 개념이 없다(작가는 이미 촬영비를 받음).
// 거래 완료만 기록하고 수수료는 입금 확인 시점에 이미 발생해 있다.
export async function confirmCompletion(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const admin = createAdminClient();
  const { data: moved } = await admin
    .from("bookings")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", me.id)
    .eq("status", "delivered")
    .select("id, photographer_id");
  if (!moved || moved.length === 0) throw new Error("처리할 수 없는 상태입니다.");

  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", moved[0].photographer_id)
    .single();
  if (ph) await notify(admin, ph.profile_id, "거래가 완료됐어요", "고객이 전달을 확인했습니다.", `/bookings/${id}`);
  revalidateBooking(id);
}

// ── 환불 (구매자 요청 / 운영자) : 오프플랫폼 ─────────────────────────
// 실제 환불 송금은 작가가 직접 사용자에게 한다. 시스템은 상태만 정리:
// 예약 refunded, 결제 환불 표시, 플랫폼 수수료 면제(waived), 슬롯 해제.
export async function refundBooking(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, user_id, photographer_id, availability_id")
    .eq("id", id)
    .single();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");

  const isBuyer = b.user_id === me.id;
  if (!isBuyer && me.role !== "admin") throw new Error("권한이 없습니다.");
  if (!["paid", "shot", "delivered"].includes(b.status)) throw new Error("환불할 수 없는 상태입니다.");

  // 예약·결제 상태 정리 (전액 환불 기준 — 직접이체라 부분환불은 당사자 간 처리)
  await admin.from("bookings").update({ status: "refunded" }).eq("id", id);
  const { data: payment } = await admin
    .from("payments")
    .select("id, amount_krw")
    .eq("booking_id", id)
    .maybeSingle();
  if (payment) {
    await admin
      .from("payments")
      .update({
        status: "refunded",
        refunded_krw: payment.amount_krw,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
  }

  // 매칭 수수료 면제
  await waiveFee(admin, id);

  // 슬롯 해제
  if (b.availability_id) {
    await admin.from("availability").update({ is_booked: false }).eq("id", b.availability_id);
  }

  await notify(admin, b.user_id, "환불 처리됐어요", "작가의 환불 송금을 확인해주세요.", `/bookings/${id}`, "payment");
  const { data: ph } = await admin.from("photographers").select("profile_id").eq("id", b.photographer_id).single();
  if (ph) await notify(admin, ph.profile_id, "예약이 환불됐어요", "환불 금액을 고객에게 송금해주세요.", `/bookings/${id}`, "payment");

  revalidateBooking(id);
}

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

// ── 예약 요청 (구매자, RLS insert) ──────────────────────────────
export async function createBooking(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const photographerId = String(formData.get("photographerId"));
  const packageId = String(formData.get("packageId"));
  const availabilityId = String(formData.get("availabilityId") || "");
  const locationText = String(formData.get("locationText") || "").slice(0, 200);
  const memo = String(formData.get("memo") || "").slice(0, 500);

  if (me.photographer?.id === photographerId) redirect("/studio");

  const supabase = await createClient();

  // 패키지 스냅샷
  const { data: pkg } = await supabase
    .from("packages")
    .select("name, description, price_krw, duration_min, edited_count")
    .eq("id", packageId)
    .single();
  if (!pkg) throw new Error("패키지를 찾을 수 없습니다.");

  // 슬롯 확인
  let shootAt: string | null = null;
  if (availabilityId) {
    const { data: slot } = await supabase
      .from("availability")
      .select("start_at, is_booked")
      .eq("id", availabilityId)
      .single();
    if (!slot || slot.is_booked) throw new Error("선택한 시간을 사용할 수 없습니다.");
    shootAt = slot.start_at;
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      user_id: me.id,
      photographer_id: photographerId,
      package_id: packageId,
      availability_id: availabilityId || null,
      status: "requested",
      shoot_at: shootAt,
      location_text: locationText,
      amount_krw: pkg.price_krw,
      package_snapshot: pkg,
      memo,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // 작가에게 알림
  const admin = createAdminClient();
  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", photographerId)
    .single();
  if (ph) await notify(admin, ph.profile_id, "새 예약 요청", memo || "예약 요청이 도착했어요.", `/bookings/${booking.id}`);

  redirect(`/bookings/${booking.id}`);
}

// ── 상태 전이 (service_role + 권한·상태 검증) ────────────────────

// 작가: 요청 수락 → accepted + 슬롯 예약
export async function acceptBooking(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, status, photographer_id, user_id, availability_id")
    .eq("id", id)
    .single();
  if (!b || b.photographer_id !== me.photographer.id) throw new Error("권한이 없습니다.");
  if (b.status !== "requested") throw new Error("수락할 수 없는 상태입니다.");

  // 슬롯 예약 (선점 경쟁 방지: is_booked=false 일 때만)
  if (b.availability_id) {
    const { data: slot } = await admin
      .from("availability")
      .update({ is_booked: true })
      .eq("id", b.availability_id)
      .eq("is_booked", false)
      .select("id");
    if (!slot || slot.length === 0) throw new Error("이미 예약된 시간입니다.");
  }

  await admin
    .from("bookings")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", id);
  await notify(admin, b.user_id, "예약이 수락됐어요", "결제를 진행해 예약을 확정하세요.", `/bookings/${id}`);
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
}

// 작가: 요청 거절
export async function rejectBooking(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 가능합니다.");

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("status, photographer_id, user_id")
    .eq("id", id)
    .single();
  if (!b || b.photographer_id !== me.photographer.id) throw new Error("권한이 없습니다.");
  if (b.status !== "requested") throw new Error("거절할 수 없는 상태입니다.");

  await admin.from("bookings").update({ status: "rejected" }).eq("id", id);
  await notify(admin, b.user_id, "예약이 거절됐어요", "다른 시간으로 다시 요청해보세요.", `/bookings/${id}`);
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
}

// 구매자/작가: 결제 전 취소 → 슬롯 해제
export async function cancelBooking(formData: FormData) {
  const id = String(formData.get("id"));
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요합니다.");

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("status, photographer_id, user_id, availability_id")
    .eq("id", id)
    .single();
  if (!b) throw new Error("예약을 찾을 수 없습니다.");

  const isBuyer = b.user_id === me.id;
  const isOwner = me.photographer?.id === b.photographer_id;
  if (!isBuyer && !isOwner) throw new Error("권한이 없습니다.");
  if (!["requested", "accepted"].includes(b.status)) throw new Error("취소할 수 없는 상태입니다.");

  if (b.availability_id) {
    await admin.from("availability").update({ is_booked: false }).eq("id", b.availability_id);
  }
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

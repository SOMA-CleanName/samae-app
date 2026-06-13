"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

// 닉네임(profiles.display_name) 수정 — 본인만(RLS check id=auth.uid()).
export async function updateDisplayName(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/settings");

  const name = String(formData.get("displayName") || "").trim().slice(0, 30);
  if (!name) throw new Error("닉네임을 입력해주세요.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", me.id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/", "layout"); // 헤더 아바타 메뉴 등 갱신
}

// 프로필 사진을 기본(이니셜)으로 되돌리기 — avatar_url 비우기.
export async function removeAvatar() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/settings");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", me.id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

// 진행 중(결제 단계)으로 보는 예약 — 이 상태면 탈퇴를 막아 거래를 보호한다.
const ACTIVE_BOOKING_STATUSES = ["accepted", "paid", "shot", "delivered"];

// 회원 탈퇴 — 본인 계정과 관련 데이터를 삭제하고 로그아웃한다.
//  · 진행 중인 예약(결제 단계)이 있으면 차단.
//  · RESTRICT FK(예약·결제·수수료)를 순서대로 정리한 뒤 프로필·인증계정 삭제.
//    프로필 삭제로 대화·메시지·찜·알림·작가/포트폴리오·후기가 CASCADE 정리된다.
export async function deleteAccount() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const admin = createAdminClient();
  const phId = me.photographer?.id ?? null;

  // 1) 관련 예약 수집 (구매자 + 작가 양쪽)
  const { data: asBuyer } = await admin.from("bookings").select("id, status").eq("user_id", me.id);
  const asPh = phId
    ? (await admin.from("bookings").select("id, status").eq("photographer_id", phId)).data ?? []
    : [];
  const all = [...(asBuyer ?? []), ...asPh];

  // 2) 진행 중 예약 있으면 차단
  if (all.some((b) => ACTIVE_BOOKING_STATUSES.includes(b.status as string))) {
    throw new Error(
      "진행 중인 예약이 있어 탈퇴할 수 없어요. 예약을 마무리하거나 취소·환불한 뒤 다시 시도해주세요."
    );
  }

  // 3) RESTRICT 자식(결제·수수료) 정리 → 예약 삭제
  const bookingIds = [...new Set(all.map((b) => b.id as string))];
  if (bookingIds.length > 0) {
    await admin.from("platform_fees").delete().in("booking_id", bookingIds);
    await admin.from("payments").delete().in("booking_id", bookingIds);
    await admin.from("bookings").delete().in("id", bookingIds);
  }
  if (phId) await admin.from("platform_fees").delete().eq("photographer_id", phId); // 잔여 수수료

  // 4) 프로필 삭제 (관련 데이터 CASCADE) → 5) 인증 계정 삭제
  const { error: delErr } = await admin.from("profiles").delete().eq("id", me.id);
  if (delErr) throw new Error("탈퇴 처리 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.");
  await admin.auth.admin.deleteUser(me.id);

  // 6) 세션 정리 (클라이언트가 홈으로 이동)
  const supabase = await createClient();
  await supabase.auth.signOut();
}

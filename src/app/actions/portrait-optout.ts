"use server";

// 초상 사용 거부 — 회원이 자기 촬영 결과물을 작가 포트폴리오·사매 홍보에 쓰지 못하게 한다.
//
// 세 문서가 이 권리를 약속한다:
//   · 작가 이용약관 13조 4항 — "회원이 원하지 않는다는 의사를 밝힌 경우에는 사용하지 않으며
//                                서비스에도 게재할 수 없습니다"
//   · 작가 입점 계약 4조 3항 — "그 의사를 밝힌 사진은 게재할 수 없습니다"
//   · 광고 소재 사용 동의 「대상」 — "원하지 않는다고 밝힌 결과물은 제외"
//
// 그런데 밝힐 자리가 없었다(2026-09-17 점검). 약관만 있고 기능이 없으면, 분쟁에서 우리가
// 댈 말이 "약관에 적어 뒀다" 뿐이다.
//
// ⚠️ **작가에게 알린다.** 조용히 저장하면 작가는 모르는 채로 사진을 올리고, 그때서야
//    위반이 된다. 거부는 작가가 지켜야 하는 의무라 통지가 의무의 전제다.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { mpTrackServer } from "@/lib/mixpanel-server";

/**
 * 거부 여부를 바꾼다. **예약의 구매자 본인만.**
 *
 * 초상권은 찍힌 사람의 것이라 작가도 운영도 대신 정할 수 없다. 작가가 끌 수 있으면
 * 권리가 아니고, 운영이 끌 수 있으면 회원이 우리를 믿을 이유가 없다.
 */
export async function setPortraitOptout(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("로그인이 필요해요.");

  const bookingId = String(formData.get("bookingId") ?? "");
  // 체크박스는 켜져 있을 때만 값이 실린다 — 없으면 끈 것이다
  const optout = formData.get("optout") === "on";
  if (!bookingId) throw new Error("예약을 찾을 수 없어요.");

  // RLS 로 참여자만 읽히지만, 참여자에는 작가도 포함된다. 구매자인지 여기서 따로 본다.
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, user_id, photographer_id, portrait_optout_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) throw new Error("예약을 찾을 수 없어요.");
  if (booking.user_id !== me.id) {
    throw new Error("촬영하신 분만 정하실 수 있어요.");
  }

  const was = !!booking.portrait_optout_at;
  if (was === optout) return; // 바뀐 게 없으면 알림도 보내지 않는다

  const admin = createAdminClient();
  const { error } = await admin
    .from("bookings")
    .update({ portrait_optout_at: optout ? new Date().toISOString() : null })
    .eq("id", bookingId);
  if (error) throw new Error("저장하지 못했어요. 다시 시도해주세요.");

  // 작가에게 알린다 — 지켜야 할 의무가 생겼거나 풀렸다는 사실
  const { data: ph } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", booking.photographer_id)
    .maybeSingle();
  if (ph?.profile_id) {
    await admin.from("notifications").insert({
      recipient_id: ph.profile_id as string,
      type: "booking",
      title: optout ? "포트폴리오 사용을 원하지 않으세요" : "포트폴리오 사용 거부가 해제됐어요",
      body: optout
        ? "이 촬영의 결과물은 포트폴리오·홍보에 쓰실 수 없어요. 이미 올리셨다면 내려주세요."
        : "이 촬영의 결과물을 포트폴리오에 쓰실 수 있어요.",
      link: `/bookings/${bookingId}`,
    });
  }

  await mpTrackServer("Set Portrait Optout", me.id, { optout });

  revalidatePath(`/bookings/${bookingId}`);
}

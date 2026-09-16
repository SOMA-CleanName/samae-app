"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { archiveAndDelete } from "@/lib/soft-delete";

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

// 프로필 사진을 기본(이니셜)으로 되돌리기.
//
// ⚠️ null 이 아니라 **빈 문자열**을 쓴다. 로그인 콜백이 카카오 프로필 사진으로 빈 아바타를
//    채우는데(adoptKakaoAvatar), null 로 두면 "아직 정해진 적 없음" 과 구분이 안 돼서
//    **다음 로그인에 카카오 사진이 되살아난다** — 사용자가 방금 지운 것을.
//      null → 아직 정해진 적 없음 (채워도 된다)
//      ""   → 사용자가 이니셜을 택했다 (건드리지 않는다)
//    화면에서는 둘 다 falsy 라 똑같이 이니셜이 나온다.
export async function removeAvatar() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/settings");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: "" })
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
/**
 * ⚠️ **막힌 이유는 throw 하지 않고 돌려준다.**
 *
 * 서버 액션에서 throw 하면 프로덕션에서는 Next.js 가 메시지를 가린다 — 화면에는
 * "An error occurred in the Server Components render." 만 뜬다. 그래서 "진행 중인
 * 예약이 있어 탈퇴할 수 없어요" 처럼 **사용자가 해결할 수 있는 안내**가 통째로
 * 사라졌다(2026-09-16 실측: 그 화면만 보고는 원인을 알 길이 없어 DB 까지 파야 했다).
 *
 * 예상 가능한 실패는 값으로 돌려주고, 진짜 예외만 throw 한다.
 */
export async function deleteAccount(): Promise<{ error?: string }> {
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
    return {
      error:
        "진행 중인 예약이 있어 탈퇴할 수 없어요. 예약을 마무리하거나 취소·환불한 뒤 다시 시도해주세요.",
    };
  }

  // 2-1) 작가는 정산·청구가 남아 있으면 차단 (입점계약 10조 2항).
  //      completed 는 '진행 중' 이 아니라서 위 검사를 통과하는데, 정산이 안 끝난 채 계정을 지우면
  //      아래에서 예약·수수료 행을 아카이브 후 삭제해 지급 기록이 사라진다.
  if (phId) {
    const [{ data: unsettled }, { data: owed }] = await Promise.all([
      admin
        .from("bookings")
        .select("id")
        .eq("photographer_id", phId)
        .not("delivered_at", "is", null)
        .is("settled_at", null)
        .is("refunded_at", null)
        .limit(1),
      admin
        .from("platform_fees")
        .select("id")
        .eq("photographer_id", phId)
        .in("status", ["accrued", "billed"])
        .limit(1),
    ]);
    if ((unsettled?.length ?? 0) > 0 || (owed?.length ?? 0) > 0) {
      return {
        error:
          "정산이 끝나지 않은 촬영이 있어 탈퇴할 수 없어요. 정산이 완료된 뒤 다시 시도하거나 사매에 문의해주세요.",
      };
    }
  }

  // 3) RESTRICT 자식(결제·수수료) 정리 → 예약 (소프트딜리트: 아카이브 후 제거)
  const bookingIds = [...new Set(all.map((b) => b.id as string))];
  if (bookingIds.length > 0) {
    await archiveAndDelete("platform_fees", { col: "booking_id", op: "in", val: bookingIds }, me.id);
    await archiveAndDelete("payments", { col: "booking_id", op: "in", val: bookingIds }, me.id);
    await archiveAndDelete("bookings", { col: "id", op: "in", val: bookingIds }, me.id);
  }
  if (phId) await archiveAndDelete("platform_fees", { col: "photographer_id", op: "eq", val: phId }, me.id);

  // 4) 프로필 아카이브 후 삭제 (나머지 관련 데이터는 CASCADE) → 5) 인증 계정 삭제
  const profRes = await archiveAndDelete("profiles", { col: "id", op: "eq", val: me.id }, me.id);
  // DB 가 돌려준 말을 그대로 붙인다. 전에는 "문제가 발생했어요" 로만 덮었는데, 실제 원인은
  // `statement timeout`(참조 컬럼 인덱스 없음, 0122 에서 수정) 이었고 그 말이 없으면
  // 화면만 보고는 알 방법이 없다.
  if (profRes.error) {
    return { error: `탈퇴 처리 중 문제가 발생했어요. (${profRes.error})` };
  }
  await admin.auth.admin.deleteUser(me.id);

  // 6) 세션 정리 (클라이언트가 홈으로 이동)
  const supabase = await createClient();
  await supabase.auth.signOut();
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveAllAndDelete, archiveAndDelete } from "@/lib/soft-delete";
import { verifyResetPassword } from "@/lib/admin-reset";

const VALID = ["new", "accepted", "confirmed", "shot", "refund_requested", "expired"];

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  return me;
}

export type ResetState = { error?: string; ok?: boolean };

// 문의 전체 초기화 — 소프트딜리트(아카이브 후 제거). 운영자 + 비밀번호.
export async function clearInquiries(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "운영자 권한이 필요합니다." };
  const pw = verifyResetPassword(formData.get("password"));
  if (pw.error) return { error: pw.error };

  const { error } = await archiveAllAndDelete("inquiries", me.id);
  if (error) return { error };
  revalidatePath("/admin/inquiries");
  return { ok: true };
}

// 선택한 문의만 삭제 — 삭제 모드. 운영자 + 비밀번호 + 선택 id 목록.
export async function deleteInquiriesSelected(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return { error: "운영자 권한이 필요합니다." };
  const pw = verifyResetPassword(formData.get("password"));
  if (pw.error) return { error: pw.error };

  const ids = parseIds(formData.get("ids"));
  if (ids.length === 0) return { error: "선택된 문의가 없어요." };

  const { error } = await archiveAndDelete("inquiries", { col: "id", op: "in", val: ids }, me.id);
  if (error) return { error };
  revalidatePath("/admin/inquiries");
  return { ok: true };
}

// FormData 의 ids(JSON 문자열 배열) 파싱 — 안전하게 문자열 배열로.
function parseIds(raw: FormDataEntryValue | null): string[] {
  try {
    const arr = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

// 문의 상태 직접 변경 — 운영자 정리용
export async function setInquiryStatus(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!VALID.includes(status)) throw new Error("잘못된 상태");

  const admin = createAdminClient();
  const now = new Date().toISOString();
  // 만료는 expired_at 과 짝 — 수동으로 만료시키거나 되돌릴 때도 시각을 맞춰준다.
  // new 로 되돌리면 new_since 도 갱신해 만료 7일을 다시 준다(안 그러면 다음 스윕에 바로 재만료).
  const { error } = await admin
    .from("inquiries")
    .update({
      status,
      expired_at: status === "expired" ? now : null,
      ...(status === "new" ? { new_since: now } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/inquiries");
}

// 문의 건당 '작가에게서 숨기기'(운영 취소) — 어드민엔 남고 작가 목록에서만 제거.
// 하드 삭제와 달리 되돌릴 수 있다. 숨길 때 작가에게 갔던 '새 문의' 알림도 함께 제거.
export async function setInquiryHidden(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const hidden = String(formData.get("hidden")) === "true";
  const admin = createAdminClient();
  const { error } = await admin
    .from("inquiries")
    .update({ hidden_from_photographer: hidden })
    .eq("id", id);
  if (error) throw new Error(error.message);
  // 숨김 처리 시 작가 알림 제거(잔여 '새 문의' 알림이 숨긴 문의를 가리키지 않게)
  if (hidden) {
    await admin.from("notifications").delete().eq("inquiry_id", id).eq("type", "booking");
  }
  revalidatePath("/admin/inquiries");
}
// 리드 입금 확인/되돌리기(confirmInquiryDeposit·revertInquiryDeposit)가 여기 있었다 —
// **지웠다(2026-09-19).** 작가가 리드를 해제하며 우리 계좌에 넣던 모델의 액션인데,
// 거래가 예약 에스크로로 바뀌면서 부르는 화면이 없어졌다. 서버 액션은 화면에 안 붙어
// 있어도 export 돼 있으면 엔드포인트라 남겨 둘 이유가 없다.
// 지난 기록(deposit_amount_krw·deposit_confirmed_at)은 컬럼째 남는다 — 그때의 근거다.

// 사매 입금 계좌 편집은 **거래·정산으로 옮겼다**(2026-09-19). 그 계좌는 리드용이 아니라
// 예약 에스크로(lib/platform-account → lib/payments)라 거래 화면이 제자리다.

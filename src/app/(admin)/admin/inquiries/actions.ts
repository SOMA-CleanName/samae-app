"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveAllAndDelete, archiveAndDelete } from "@/lib/soft-delete";
import { verifyResetPassword } from "@/lib/admin-reset";

const VALID = ["new", "accepted", "confirmed", "shot", "refund_requested"];

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
  const { error } = await admin.from("inquiries").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/inquiries");
}

// 입금 확인 — accepted(입금대기) → confirmed(연락처 공개). 작가에게 알림.
export async function confirmInquiryDeposit(formData: FormData) {
  const me = await assertAdmin();
  const id = String(formData.get("id"));
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("inquiries")
    .update({
      status: "confirmed",
      deposit_confirmed_at: new Date().toISOString(),
      deposit_confirmed_by: me.id,
    })
    .eq("id", id)
    .eq("status", "accepted")
    .select("photographer:photographers(profile_id)")
    .maybeSingle();
  if (error) throw new Error(error.message);

  // 작가에게 알림 — 연락처 공개됨
  const ph = data?.photographer as { profile_id?: string } | { profile_id?: string }[] | null;
  const profileId = Array.isArray(ph) ? ph[0]?.profile_id : ph?.profile_id;
  if (profileId) {
    await admin.from("notifications").insert({
      recipient_id: profileId,
      type: "payment",
      title: "입금이 확인됐어요",
      body: "입금이 확인되어 고객 연락처가 공개됐어요. 예약 목록에서 확인하세요.",
      inquiry_id: id,
    });
  }
  revalidatePath("/admin/inquiries");
}

// 입금 취소(되돌리기) — confirmed → accepted (오확인 정정)
export async function revertInquiryDeposit(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const admin = createAdminClient();
  const { error } = await admin
    .from("inquiries")
    .update({ status: "accepted", deposit_confirmed_at: null, deposit_confirmed_by: null })
    .eq("id", id)
    .eq("status", "confirmed");
  if (error) throw new Error(error.message);
  revalidatePath("/admin/inquiries");
}

// 플랫폼(우리) 입금 계좌 수정
export async function updatePlatformAccount(formData: FormData) {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_account")
    .update({
      bank: String(formData.get("bank") ?? "").trim(),
      number: String(formData.get("number") ?? "").trim(),
      holder: String(formData.get("holder") ?? "").trim(),
      notice: String(formData.get("notice") ?? "").trim(),
    })
    .eq("id", true);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/inquiries");
}

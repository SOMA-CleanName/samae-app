"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

// 운영자 권한 확인 (방어적 — RLS 외 이중 체크)
async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    throw new Error("운영자 권한이 필요합니다.");
  }
}

// 작가 승인: pending/rejected → approved
export async function approvePhotographer(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("photographers")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photographers");
}

// 작가 반려: → rejected
export async function rejectPhotographer(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("photographers")
    .update({ status: "rejected" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photographers");
}

// 작가 정지: approved → suspended (탐색/노출 차단). 복구는 승인으로.
export async function suspendPhotographer(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("photographers")
    .update({ status: "suspended" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photographers");
}

// ── 공개 신청(리드) 처리 — photographer_applications ──
// 리드는 계정이 없어 직접 승인 불가. 운영자가 연락 후 상태를 갱신하거나 정리한다.

// 연락 완료 표시: new → contacted
export async function markApplicationContacted(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("photographer_applications")
    .update({ status: "contacted" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photographers");
}

// 리드 삭제(처리 완료/중복 정리)
export async function deleteApplication(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("photographer_applications")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photographers");
}

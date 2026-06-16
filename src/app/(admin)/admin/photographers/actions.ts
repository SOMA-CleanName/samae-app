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

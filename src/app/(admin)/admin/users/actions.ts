"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// 운영자 확인 + 본인 id 반환 (자기 자신 보호용)
async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  return me;
}

// 역할 변경 — user ↔ admin. 본인 권한은 못 내림(잠금 방지).
export async function setUserRole(formData: FormData) {
  const me = await assertAdmin();
  const id = String(formData.get("id"));
  const role = String(formData.get("role")); // 'admin' | 'user'
  if (role !== "admin" && role !== "user") throw new Error("잘못된 역할");
  if (id === me.id && role !== "admin") throw new Error("자신의 운영자 권한은 해제할 수 없어요.");

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

// 계정 정지/해제 — auth 의 ban_duration 으로 처리. 본인은 정지 불가.
export async function setUserBan(formData: FormData) {
  const me = await assertAdmin();
  const id = String(formData.get("id"));
  const ban = String(formData.get("ban")) === "1";
  if (id === me.id && ban) throw new Error("자신의 계정은 정지할 수 없어요.");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, {
    ban_duration: ban ? "876000h" : "none", // ~100년 = 사실상 영구 / none = 해제
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

// ── 작가 신청 처리 — photographer_applications ──
// 신청 승인 시 그 계정(profile_id)으로 photographers(approved) 를 생성/갱신한다.

// 신청 승인: 계정 연동 신청 → photographers(approved) 생성 + 신청 status=approved
export async function approveApplication(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  // 크로스-계정 photographers 생성이 필요하므로 service_role 사용(RLS 우회)
  const admin = createAdminClient();

  const { data: app, error: appErr } = await admin
    .from("photographer_applications")
    .select("id, profile_id, display_name, bio")
    .eq("id", id)
    .maybeSingle();
  if (appErr) throw new Error(appErr.message);
  if (!app) throw new Error("신청을 찾을 수 없어요.");
  if (!app.profile_id) {
    throw new Error("계정에 연동되지 않은 옛 신청이에요. 지원자에게 로그인 후 재신청을 안내해주세요.");
  }

  const nowIso = new Date().toISOString();

  // 이미 photographers 행이 있으면 승인으로 갱신, 없으면 생성
  const { data: existing } = await admin
    .from("photographers")
    .select("id")
    .eq("profile_id", app.profile_id)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("photographers")
      .update({ status: "approved", approved_at: nowIso, display_name: app.display_name, bio: app.bio ?? "" })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("photographers").insert({
      profile_id: app.profile_id,
      display_name: app.display_name,
      bio: app.bio ?? "",
      status: "approved",
      approved_at: nowIso,
    });
    if (error) throw new Error(error.message);
  }

  const { error: updErr } = await admin
    .from("photographer_applications")
    .update({ status: "approved" })
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  revalidatePath("/admin/photographers");
}

// 신청 반려: status=rejected (지원자는 재신청 가능)
export async function rejectApplication(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("photographer_applications")
    .update({ status: "rejected" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/photographers");
}

// 신청 삭제(옛 리드·중복 정리)
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

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

// ── 리드 단가 ──
// 작가가 리드 1건을 해제할 때 우리 계좌로 입금하는 금액. 작가마다 다르게 운영한다.
// 접수 시 inquiries.deposit_amount_krw 로 스냅샷되므로(트리거, 0072),
// 단가를 바꾸면 아직 미해제(status='new')인 리드도 새 단가를 따라가도록 함께 갱신한다.
// 이미 해제 신청(accepted)·입금확인(confirmed)된 건은 금액이 확정된 것이라 건드리지 않는다.

const MAX_LEAD_PRICE = 10_000_000;

// "6,000" · "6000원" 같은 입력도 허용. 빈 값이면 null(= 기본 단가 사용).
function parsePrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) throw new Error("리드 단가는 숫자로 입력해주세요.");
  const price = Number(digits);
  if (!Number.isFinite(price) || price > MAX_LEAD_PRICE) {
    throw new Error(`리드 단가는 0 ~ ${MAX_LEAD_PRICE.toLocaleString("ko-KR")}원 사이로 입력해주세요.`);
  }
  return price;
}

// 미해제 리드 금액 동기화 — 작가 단위
async function syncPendingLeads(
  admin: ReturnType<typeof createAdminClient>,
  photographerIds: string[],
  amount: number
) {
  if (photographerIds.length === 0) return;
  const { error } = await admin
    .from("inquiries")
    .update({ deposit_amount_krw: amount })
    .in("photographer_id", photographerIds)
    .eq("status", "new");
  if (error) throw new Error(error.message);
}

async function getDefaultLeadPrice(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data } = await admin
    .from("platform_account")
    .select("default_lead_price_krw")
    .eq("id", true)
    .maybeSingle();
  return (data?.default_lead_price_krw as number | null) ?? 6000;
}

// 작가별 단가 저장 — 빈 값이면 기본 단가를 따르도록 null 로 되돌린다.
export async function updateLeadPrice(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const price = parsePrice(String(formData.get("price") ?? ""));

  const admin = createAdminClient();
  const { error } = await admin
    .from("photographers")
    .update({ lead_price_krw: price })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await syncPendingLeads(admin, [id], price ?? (await getDefaultLeadPrice(admin)));

  revalidatePath("/admin/photographers");
  revalidatePath("/studio");
}

// 기본 단가 저장 — 개별 단가가 없는(null) 작가 전원에게 적용된다.
export async function updateDefaultLeadPrice(formData: FormData) {
  await assertAdmin();
  const price = parsePrice(String(formData.get("price") ?? ""));
  if (price === null) throw new Error("기본 단가는 비워둘 수 없습니다.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_account")
    .update({ default_lead_price_krw: price })
    .eq("id", true);
  if (error) throw new Error(error.message);

  // 개별 단가가 없는 작가들의 미해제 리드만 새 기본 단가로
  const { data: followers, error: readErr } = await admin
    .from("photographers")
    .select("id")
    .is("lead_price_krw", null);
  if (readErr) throw new Error(readErr.message);
  await syncPendingLeads(admin, (followers ?? []).map((p) => p.id as string), price);

  revalidatePath("/admin/photographers");
  revalidatePath("/studio");
}

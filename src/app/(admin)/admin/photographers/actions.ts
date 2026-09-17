"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { archiveAndDelete } from "@/lib/soft-delete";
import { notifyOpsApplicationApproved } from "@/lib/ops-alert";
import { feeSpecFromRow, feeSpecLabel } from "@/lib/platform-fee";

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

  // 승인하면서 요율을 같이 정한다.
  //
  // 작가는 승인 직후 **입점 신청(AgreeGate)에서 곧바로 등록**된다 — 그 사이에 요율을
  // 손볼 자리가 없다. 나중에 고치면 이미 등록된 상품·예약이 옛 요율로 굳어 있고
  // (fee_snapshot 은 제안 시점에 박힌다), 작가는 처음 본 숫자와 다른 정산을 받는다.
  //
  // 비워 두면 기본 요율. 손으로 적었으면 그 값으로 연다.
  const rateRaw = String(formData.get("feeRate") ?? "").trim();
  const ratePct = rateRaw === "" ? null : Number(rateRaw);
  if (ratePct != null && (!Number.isFinite(ratePct) || ratePct <= 0 || ratePct > 50)) {
    throw new Error("요율은 0 초과 50 이하로 적어주세요 (%).");
  }
  const feeFields =
    ratePct == null
      ? {}
      : { fee_mode: "rate" as const, fee_rate: +(ratePct / 100).toFixed(4), fee_amount_krw: null };

  // 이미 photographers 행이 있으면 승인으로 갱신, 없으면 생성
  const { data: existing } = await admin
    .from("photographers")
    .select("id")
    .eq("profile_id", app.profile_id)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("photographers")
      .update({
        status: "approved",
        approved_at: nowIso,
        display_name: app.display_name,
        bio: app.bio ?? "",
        ...feeFields,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("photographers").insert({
      profile_id: app.profile_id,
      display_name: app.display_name,
      bio: app.bio ?? "",
      status: "approved",
      approved_at: nowIso,
      ...feeFields,
    });
    if (error) throw new Error(error.message);
  }

  const { error: updErr } = await admin
    .from("photographer_applications")
    .update({ status: "approved" })
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  // 승인만 눌러 두면 작가는 아무것도 모른다 — 승인은 "이제 입점할 수 있다" 는 뜻이지
  // 입점이 끝났다는 뜻이 아니다. 보낼 안내 대본을 운영 채널에 같이 올린다.
  await notifyOpsApplicationApproved({
    displayName: app.display_name ?? "작가",
    feeLabel: feeSpecLabel(feeSpecFromRow(feeFields)),
  });

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

// ── 중개 수수료 (수수료정책 1조·2조) ─────────────────────────────
// 기본은 정률 20%(부가세 별도). 정액은 옛 모델이라 명시한 작가만 쓴다.
//
// 이미 제안된 예약은 fee_snapshot 으로 굳어 있어 여기서 바꿔도 소급되지 않는다.
import { MAX_FEE_RATE, MIN_FEE_RATE } from "@/lib/platform-fee";

export async function updatePhotographerFee(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const mode = String(formData.get("mode") ?? "rate") === "flat" ? "flat" : "rate";
  const raw = String(formData.get("value") ?? "").trim();

  const patch: Record<string, unknown> = { fee_mode: mode };

  if (mode === "rate") {
    // 화면에서는 퍼센트(10)로 받고 DB 에는 비율(0.1)로 넣는다.
    // 0.1 대신 10 을 넣는 사고가 잦은 자리라 범위를 여기서도 막는다(DB 제약과 이중).
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct <= 0) throw new Error("요율을 입력해주세요 (예: 20).");
    const rate = pct / 100;
    if (rate < MIN_FEE_RATE || rate > MAX_FEE_RATE)
      throw new Error(`요율은 ${MIN_FEE_RATE * 100}% ~ ${MAX_FEE_RATE * 100}% 사이여야 해요.`);
    patch.fee_rate = rate;
  } else {
    // 비우면 전역 기본값을 따른다
    const amount = raw ? Number(raw.replace(/[^0-9]/g, "")) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0))
      throw new Error("수수료 금액이 올바르지 않아요.");
    patch.fee_amount_krw = amount;
    patch.fee_rate = null;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("photographers").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/photographers");
  revalidatePath("/admin/transactions");
}


/**
 * 사업자등록증 확인 처리 — 어드민이 등록증과 입력값(상호·대표자·번호)을 눈으로 대조한 뒤 누른다.
 *
 * 이 기록이 곧 전자상거래법 20조의 "확인" 이다. 누가 언제 봤는지가 남아야 말이 된다.
 * 파일이 새로 올라오면 이전 확인은 자동으로 무효가 된다(api/studio/business-license).
 */
export async function verifyBusinessLicense(formData: FormData) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") throw new Error("권한이 없습니다.");

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("작가를 찾지 못했습니다.");
  // 반려할 때 이유를 남긴다 — 없으면 작가에게 뭘 다시 받을지 알 수 없다
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  const ok = formData.get("ok") === "1";

  await createAdminClient()
    .from("photographers")
    .update({
      business_license_verified_at: ok ? new Date().toISOString() : null,
      business_license_verified_by: ok ? me.id : null,
      business_license_note: note,
    })
    .eq("id", id);

  revalidatePath("/admin/photographers");
}

/**
 * 작가 퇴출 — **계정은 살리고 작가 등록만 해제한다.**
 *
 * 정지(suspendPhotographer)와 다르다. 정지는 status 만 바꿔 노출을 끊고 언제든 되돌린다.
 * 퇴출은 photographers 행 자체를 없애 그 계정을 **일반 회원으로 되돌린다** — 프로필·사진·
 * 패키지·대화·후기가 함께 사라지고, 본인은 작가 신청부터 다시 할 수 있다.
 *
 * ⚠️ 딸려 나가는 게 많다. photographers 를 참조하는 18개 표가 CASCADE 다 —
 *    photos·packages·conversations·reviews·albums·availability·highlights…
 *    그래서 **아카이브 후 삭제**한다(archiveAndDelete). 잘못 눌러도 되돌릴 수 있어야 한다.
 *
 * ⚠️ 돈이 걸린 건 막는다. bookings·platform_fees 는 RESTRICT 라 남아 있으면 삭제 자체가
 *    실패하는데, 그때 나오는 건 FK 위반 메시지뿐이라 운영자가 뭘 해야 할지 모른다.
 *    먼저 세어 보고 사람 말로 막는다.
 */
export async function removePhotographer(formData: FormData) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") throw new Error("운영자 권한이 필요합니다.");

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("작가를 찾지 못했습니다.");

  const admin = createAdminClient();
  const [{ count: bookingCount }, { count: feeCount }] = await Promise.all([
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("photographer_id", id),
    admin
      .from("platform_fees")
      .select("id", { count: "exact", head: true })
      .eq("photographer_id", id),
  ]);

  if ((bookingCount ?? 0) > 0 || (feeCount ?? 0) > 0) {
    throw new Error(
      `예약 ${bookingCount ?? 0}건·수수료 ${feeCount ?? 0}건이 남아 있어 퇴출할 수 없어요. ` +
        "정산·환불을 마무리한 뒤 다시 시도하거나, 노출만 끊으려면 '정지'를 쓰세요."
    );
  }

  // 아카이브 후 삭제. 나머지 표는 CASCADE 로 따라 지워진다
  const res = await archiveAndDelete("photographers", { col: "id", op: "eq", val: id }, me.id);
  if (res.error) throw new Error(`퇴출 처리 중 문제가 발생했어요. (${res.error})`);

  revalidatePath("/admin/photographers");
}

"use server";

import { revalidatePath } from "next/cache";
// 계약 조건·자격이 바뀌는 액션은 누가 했는지 남긴다 (0136)
import { logAdminAction } from "@/lib/admin-audit";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { archiveAndDelete } from "@/lib/soft-delete";
import { notifyOpsApplicationApproved } from "@/lib/ops-alert";
import { feeNeedsSetup, feeSpecFromRow, feeSpecLabel } from "@/lib/platform-fee";

// 운영자 권한 확인 (방어적 — RLS 외 이중 체크).
// **확인한 사람을 돌려준다** — 행동 기록(0136)에 누가 했는지 남겨야 해서다.
async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    throw new Error("운영자 권한이 필요합니다.");
  }
  return me;
}

// 작가 승인: pending/rejected → approved
/** 승인 — 정지였다면 우리가 가린 것도 함께 되돌린다 */
export async function approvePhotographer(formData: FormData) {
  const me = await assertAdmin();
  const id = String(formData.get("id"));
  const admin = createAdminClient();

  /*
    ⚠️ **요율을 책정하지 않고 승인할 수 없다.**

    운영 흐름은 ① 신청 ② 어드민이 보고 수수료 책정 ③ 승인 ④ 작가가 **그 요율로** 계약서를
    읽고 동의하며 입점, 순이다(2026-09-21 확정). 요율이 빈 채로 승인하면 ④ 에서 작가가
    전역 기본값을 자기 요율로 알고 동의한다 — 나중에 값을 넣으면 **작가가 동의한 숫자와
    실제 숫자가 달라진다.**

    신청서 경로(approveApplication)는 승인 폼에서 요율을 함께 받는데, 이 경로(승인 대기)는
    받지 않아 그대로 통과했다. 목록 행에 수수료 설정이 이미 있으므로 거기서 먼저 정하면 된다.
  */
  const { data: cur } = await admin
    .from("photographers")
    .select("fee_mode, fee_rate, fee_amount_krw")
    .eq("id", id)
    .maybeSingle();
  if (feeNeedsSetup(feeSpecFromRow(cur))) {
    throw new Error("먼저 이 작가의 수수료를 책정해주세요. 목록의 수수료 칸에 값을 넣고 저장한 뒤 승인할 수 있어요.");
  }

  const { error } = await admin
    .from("photographers")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // 정지 때 우리가 내린 것만 되돌린다. 작가가 스스로 숨겨 둔 사진은 그대로 둔다
  const { error: showErr } = await admin.rpc("restore_photographer_content", {
    p_photographer_id: id,
  });
  if (showErr) throw new Error(`노출을 되돌리지 못했어요. (${showErr.message})`);

  await logAdminAction({
    action: "photographer_approve",
    actor: { id: me.id, label: me.displayName },
    target: { table: "photographers", id: id },
  });
  revalidatePath("/admin/photographers");
}

// 작가 반려: → rejected. 정지와 같이 노출도 끊는다 — 반려된 작가가 피드에 남으면 안 된다
export async function rejectPhotographer(formData: FormData) {
  const me = await assertAdmin();
  const id = String(formData.get("id"));
  const admin = createAdminClient();
  const { error } = await admin
    .from("photographers")
    .update({ status: "rejected" })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const { error: hideErr } = await admin.rpc("suspend_photographer_content", {
    p_photographer_id: id,
  });
  if (hideErr) throw new Error(`노출을 끊지 못했어요. (${hideErr.message})`);

  await logAdminAction({
    action: "photographer_reject",
    actor: { id: me.id, label: me.displayName },
    target: { table: "photographers", id: id },
  });
  revalidatePath("/admin/photographers");
}

/**
 * 작가 정지 — **고객에게 어디서도 안 보이게 한다.**
 *
 * status 만 바꾸는 걸로는 안 가려진다. 고객 화면(피드·매거진·카테고리·태그·검색·
 * sitemap·페르소나)이 전부 service_role 로 조회해 RLS 를 통과하고, 앱 쿼리 20여 곳 중
 * 작가 상태를 거르는 건 일부뿐이다. 실제로 정지해도 사진과 패키지가 그대로 떴다.
 *
 * 그래서 **이미 모두가 보고 있는 값**을 내린다 — 사진은 archived, 패키지는 비활성.
 * 고치지 않은 경로까지 한 번에 가려진다(0126).
 *
 * 문의·예약·정산 기록은 건드리지 않는다. 작가를 못 보게 하는 것과 지난 거래를 지우는
 * 것은 다른 일이다.
 */
export async function suspendPhotographer(formData: FormData) {
  const me = await assertAdmin();
  const id = String(formData.get("id"));
  const admin = createAdminClient();
  const { error } = await admin
    .from("photographers")
    .update({ status: "suspended" })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // 공개 중이던 것만 내리고 표시를 남긴다 — 복귀 때 그 표시가 있는 것만 되돌린다.
  // 작가가 스스로 숨겨 둔 사진을 우리가 공개해 버리면 안 된다.
  const { error: hideErr } = await admin.rpc("suspend_photographer_content", {
    p_photographer_id: id,
  });
  if (hideErr) throw new Error(`노출을 끊지 못했어요. (${hideErr.message})`);

  await logAdminAction({
    action: "photographer_suspend",
    actor: { id: me.id, label: me.displayName },
    target: { table: "photographers", id: id },
  });
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

// ── 리드 단가 — **삭제됨 (2026-09-18)** ──
// 리드 모델이 폐지되고 채팅 상주로 바뀌면서(docs/23) 어드민에 단가를 거는 화면이 사라졌다.
// `updateLeadPrice`·`updateDefaultLeadPrice` 와 그 헬퍼 셋은 **호출부가 하나도 없는 채로**
// 남아 있었다. 서버 액션은 화면에 안 붙어 있어도 export 돼 있으면 엔드포인트라, 쓰지 않는
// 쓰기 경로를 열어 둘 이유가 없다. `photographers.lead_price_krw` ·
// `platform_account.default_lead_price_krw` 컬럼은 남겨 둔다 — 지난 리드의 근거다.

// ── 중개 수수료 (작가약관 12조 · 입점 동의서 3항) ─────────────────
// 기본은 정률 18%(부가세 별도, 2026-09-21 신규 작가부터. 기존 작가는 행에 적힌 10%). 정액은 옛 모델이라 명시한 작가만 쓴다.
//
// 이미 제안된 예약은 fee_snapshot 으로 굳어 있어 여기서 바꿔도 소급되지 않는다.
import { MAX_FEE_RATE, MIN_FEE_RATE } from "@/lib/platform-fee";

export async function updatePhotographerFee(formData: FormData) {
  const me = await assertAdmin();
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

  // 수수료는 작가와의 **계약 조건**이다. 바꾼 값을 그대로 남긴다.
  await logAdminAction({
    action: "fee_change",
    actor: { id: me.id, label: me.displayName },
    target: { table: "photographers", id },
    detail: patch as Record<string, unknown>,
  });
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

  await logAdminAction({
    action: "license_verify",
    actor: { id: me.id, label: me.displayName },
    target: { table: "photographers", id },
    detail: { verified: ok, note: note || null },
  });
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

  await logAdminAction({
    action: "photographer_remove",
    actor: { id: me.id, label: me.displayName },
    target: { table: "photographers", id: id },
  });
  revalidatePath("/admin/photographers");
}

// ── 후기 숨김 (0137) ─────────────────────────────────────────
//
// 부적절한 후기를 **지우지 않고 가린다.** 지우면 왜 사라졌는지 답할 수 없고, 분쟁이
// 나면 원문이 필요하다. 가리면 평점 집계에서도 빠진다(트리거, 0137).
//
// 쓴 본인은 계속 본다 — 자기 글이 예약 상세에서 통째로 사라지면 "내 후기가 왜 없지"
// 가 된다. 작가와 다른 사람에게만 안 보인다.
export async function setReviewHidden(formData: FormData): Promise<void> {
  const me = await assertAdmin();
  const id = String(formData.get("id"));
  const hide = String(formData.get("hide")) === "1";
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  // 가릴 땐 사유를 받는다. 나중에 "왜 내렸냐" 에 답할 수 있어야 한다.
  if (hide && !reason) throw new Error("가리는 사유를 적어주세요.");

  const { error } = await createAdminClient()
    .from("reviews")
    .update(
      hide
        ? { hidden_at: new Date().toISOString(), hidden_by: me.id, hidden_reason: reason }
        : { hidden_at: null, hidden_by: null, hidden_reason: null }
    )
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logAdminAction({
    action: hide ? "review_hide" : "review_show",
    actor: { id: me.id, label: me.displayName },
    target: { table: "reviews", id },
    detail: hide ? { reason } : {},
  });

  // 평점이 바뀌므로 작가가 보이는 지면도 함께 되살린다
  revalidatePath("/admin/photographers");
  revalidatePath("/studio/reviews");
}

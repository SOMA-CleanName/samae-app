"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { ADULT_AGE, CASTING_BUCKET, ageYears } from "@/lib/casting";

// 운영자 권한 확인 (방어적 — RLS 외 이중 체크)
async function assertAdmin(): Promise<string> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  return me.id;
}

const DECISIONS = ["new", "shortlisted", "selected", "rejected"] as const;
type Decision = (typeof DECISIONS)[number];

/**
 * 신청 판정.
 *
 * 미성년 + 동의서 없음 → 선정 불가. UI 에서도 버튼을 막지만 여기서 한 번 더 막는다.
 * (DB 트리거가 최종 방어선이지만, 트리거까지 가면 사용자는 raw 에러 화면을 보게 된다.
 *  여기서 잡아야 읽을 수 있는 메시지가 나온다.)
 */
export async function decideCastingApplication(formData: FormData) {
  const adminId = await assertAdmin();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")) as Decision;
  if (!DECISIONS.includes(decision)) throw new Error("알 수 없는 판정이에요.");

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("casting_applications")
    .select("id, birth_date, guardian_consent_path, round_id")
    .eq("id", id)
    .maybeSingle();
  if (!app) throw new Error("신청을 찾을 수 없어요.");

  if (decision === "selected") {
    const age = ageYears(app.birth_date as string);
    if (age !== null && age < ADULT_AGE && !app.guardian_consent_path) {
      throw new Error("보호자 동의서가 등록되어야 선정할 수 있어요. 보호자에게 회수 요청해주세요.");
    }
  }

  const { error } = await admin
    .from("casting_applications")
    .update({
      status: decision,
      // 심사 전(new)으로 되돌리면 판정 기록도 지운다 — 잘못 누른 걸 되돌리는 경로
      decided_at: decision === "new" ? null : new Date().toISOString(),
      decided_by: decision === "new" ? null : adminId,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/casting");
}

/** 내부 메모 저장 — 신청자에게 노출되지 않는다. */
export async function saveCastingMemo(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const memo = String(formData.get("memo") ?? "").trim();

  const admin = createAdminClient();
  const { error } = await admin
    .from("casting_applications")
    .update({ reject_reason: memo || null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/casting");
}

/**
 * 운영진이 대신 보호자 동의서를 등록한다.
 *
 * 실제 운영에서는 보호자가 카톡·메일로 사진을 보내는 경우가 대부분이다.
 * 이 경로가 없으면 "신청자가 웹에 직접 올리는 것" 외에는 방법이 없어 선정이 막힌다.
 */
export async function uploadGuardianConsent(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("파일을 선택해주세요.");
  if (file.size > 15 * 1024 * 1024) throw new Error("15MB 이하 파일만 올릴 수 있어요.");

  const isPdf = file.type === "application/pdf";
  if (!isPdf && !file.type.startsWith("image/")) throw new Error("이미지 또는 PDF만 올릴 수 있어요.");

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("casting_applications")
    .select("id, profile_id, round:casting_rounds!inner(slug)")
    .eq("id", id)
    .maybeSingle();
  if (!app) throw new Error("신청을 찾을 수 없어요.");

  const round = (Array.isArray(app.round) ? app.round[0] : app.round) as { slug: string };

  let body: Buffer;
  let contentType: string;
  let ext: string;
  if (isPdf) {
    body = Buffer.from(await file.arrayBuffer());
    contentType = "application/pdf";
    ext = "pdf";
  } else {
    const sharp = (await import("sharp")).default;
    // 서명·글씨를 읽어야 하므로 크게 남긴다
    body = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 2000, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    contentType = "image/jpeg";
    ext = "jpg";
  }

  const path = `${round.slug}/${app.profile_id}/consent_admin_${Date.now()}.${ext}`;
  const up = await admin.storage.from(CASTING_BUCKET).upload(path, body, { contentType });
  if (up.error) throw new Error("업로드에 실패했어요.");

  const { error } = await admin
    .from("casting_applications")
    .update({ guardian_consent_path: path })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/casting");
}

const ROUND_STATUSES = ["draft", "open", "closed", "selecting", "done"] as const;

/** 회차 상태 전환 — draft 는 공개되지 않고, open 이어야 신청을 받는다. */
export async function setCastingRoundStatus(formData: FormData) {
  await assertAdmin();
  const roundId = String(formData.get("roundId"));
  const status = String(formData.get("status"));
  if (!ROUND_STATUSES.includes(status as (typeof ROUND_STATUSES)[number])) {
    throw new Error("알 수 없는 상태예요.");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("casting_rounds").update({ status }).eq("id", roundId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/casting");
  revalidatePath("/casting");
}

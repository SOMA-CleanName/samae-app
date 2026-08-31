"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { notifyOpsNewCastingApplication } from "@/lib/ops-alert";
import { mpTrackServer } from "@/lib/mixpanel-server";
import { ageGate, isAcceptingNow, PICK_MAX, PICK_MIN, PHOTO_MAX } from "@/lib/casting";

export type CastingState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const Schema = z.object({
  roundSlug: z.string().trim().min(1),
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(40),
  phone: z.string().trim().min(1, "연락처를 입력해주세요.").max(30),
  birthDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일을 정확히 입력해주세요."),
  gender: z.string().trim().max(20).optional(),
  region: z.string().trim().min(1, "촬영 가능한 지역을 입력해주세요.").max(60),
  photoIds: z.array(z.string().uuid()).min(PICK_MIN, "찍고 싶은 사진을 골라주세요.").max(PICK_MAX),
  moodTags: z.array(z.string().trim().max(30)).max(10).default([]),
  conceptNote: z.string().trim().max(1000).optional(),
  photoPaths: z.array(z.string().trim().max(300)).max(PHOTO_MAX).default([]),
  consentParticipate: z.boolean(),
  consentSns: z.boolean().default(false),
  consentPaidAd: z.boolean().default(false),
  consentCredit: z.boolean().default(false),
  guardianName: z.string().trim().max(40).optional(),
  guardianPhone: z.string().trim().max(30).optional(),
  guardianRelation: z.string().trim().max(20).optional(),
  guardianConsentPath: z.string().trim().max(300).optional(),
  notifyNextRound: z.boolean().default(true),
  utmSource: z.string().trim().max(100).optional(),
  utmMedium: z.string().trim().max(100).optional(),
  utmCampaign: z.string().trim().max(100).optional(),
  landingPath: z.string().trim().max(300).optional(),
});

const blank = (v?: string) => (v && v.length > 0 ? v : null);

/**
 * 캐스팅 신청 접수.
 *
 * 검증이 세 겹이다 — 폼(UX) / 여기(에러 메시지) / DB 트리거(최종 방어선).
 * 여기서 통과시켜도 DB 가 다시 막으므로, 이 함수의 역할은 "막는 것"보다
 * **사람이 읽을 수 있는 이유를 돌려주는 것**에 가깝다.
 */
export async function submitCastingApplication(
  _prev: CastingState,
  formData: FormData,
): Promise<CastingState> {
  const me = await getCurrentUser();
  if (!me) return { error: "로그인이 필요해요. 로그인 후 다시 신청해주세요." };

  const json = formData.get("payload");
  if (typeof json !== "string") return { error: "요청이 올바르지 않아요." };

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { error: "요청이 올바르지 않아요." };
  }

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { error: "입력값을 확인해주세요.", fieldErrors };
  }
  const v = parsed.data;

  if (!v.consentParticipate) {
    return { error: "촬영 참여 동의가 필요해요.", fieldErrors: { consentParticipate: "필수 항목이에요." } };
  }

  // ── 연령 게이트 ──────────────────────────────────────────────
  const gate = ageGate(v.birthDate);
  if (gate.kind === "invalid") {
    return { error: "생년월일을 확인해주세요.", fieldErrors: { birthDate: "생년월일을 정확히 입력해주세요." } };
  }
  if (gate.kind === "too_young") {
    return {
      error: "만 15세 이상부터 신청하실 수 있어요.",
      fieldErrors: { birthDate: "만 15세 이상부터 신청할 수 있어요." },
    };
  }
  const isMinor = gate.kind === "minor";
  if (isMinor) {
    // 동의서 파일은 아직 없어도 된다(선정 시점 게이트). 다만 보호자 연락 수단은 지금 확보한다.
    const fieldErrors: Record<string, string> = {};
    if (!blank(v.guardianName)) fieldErrors.guardianName = "보호자 성명을 입력해주세요.";
    if (!blank(v.guardianPhone)) fieldErrors.guardianPhone = "보호자 연락처를 입력해주세요.";
    if (Object.keys(fieldErrors).length > 0) {
      return { error: "미성년자는 보호자 성명과 연락처가 필요해요.", fieldErrors };
    }
  }

  const admin = createAdminClient();

  // ── 회차 검증 ────────────────────────────────────────────────
  const { data: round } = await admin
    .from("casting_rounds")
    .select("id, slug, title, status, opens_at, closes_at")
    .eq("slug", v.roundSlug)
    .maybeSingle();
  if (!round) return { error: "회차를 찾을 수 없어요." };

  const accepting = isAcceptingNow({
    status: round.status as "open",
    opensAt: round.opens_at,
    closesAt: round.closes_at,
  });
  if (!accepting) return { error: "지금은 접수 기간이 아니에요. 다음 회차 알림을 신청해주세요." };

  // ── 고른 사진 검증 · 작가 유도 ────────────────────────────────
  // 사진에서 작가를 유도한다(배정·슬롯 계산은 여전히 작가 단위).
  // 폼 밖에서 임의의 사진 id 를 밀어 넣는 걸 막기 위해, 그 사진의 작가가
  // 실제로 이번 회차 참여 작가인지까지 확인한다.
  const { data: pickedPhotos } = await admin
    .from("photos")
    .select("id, photographer_id")
    .in("id", v.photoIds)
    .eq("visibility", "published");

  if ((pickedPhotos ?? []).length !== v.photoIds.length) {
    return { error: "고르신 사진 중 지금은 볼 수 없는 사진이 있어요. 다시 골라주세요.", fieldErrors: { photoIds: "다시 선택해주세요." } };
  }

  const photographerIds = [...new Set((pickedPhotos ?? []).map((p) => p.photographer_id as string))];

  const { data: joined } = await admin
    .from("casting_round_photographers")
    .select("photographer_id, photographer:photographers!inner(display_name)")
    .eq("round_id", round.id)
    .in("photographer_id", photographerIds);

  const validIds = new Set((joined ?? []).map((r) => r.photographer_id as string));
  if (photographerIds.some((id) => !validIds.has(id))) {
    return { error: "이번 회차에 참여하지 않는 작가의 사진이 포함되어 있어요.", fieldErrors: { photoIds: "다시 선택해주세요." } };
  }

  // ── 중복 신청 ────────────────────────────────────────────────
  const { data: dup } = await admin
    .from("casting_applications")
    .select("id")
    .eq("round_id", round.id)
    .eq("profile_id", me.id)
    .neq("status", "withdrawn")
    .maybeSingle();
  if (dup) return { error: "이미 이번 회차에 신청하셨어요." };

  const { data: inserted, error } = await admin
    .from("casting_applications")
    .insert({
      round_id: round.id,
      profile_id: me.id,
      name: v.name,
      phone: v.phone,
      birth_date: v.birthDate,
      gender: blank(v.gender),
      region: v.region,
      preferred_photo_ids: v.photoIds,
      preferred_photographer_ids: photographerIds,
      mood_tags: v.moodTags,
      concept_note: blank(v.conceptNote),
      photo_paths: v.photoPaths,
      consent_participate: v.consentParticipate,
      consent_sns: v.consentSns,
      consent_paid_ad: v.consentPaidAd,
      consent_credit: v.consentCredit,
      guardian_name: isMinor ? blank(v.guardianName) : null,
      guardian_phone: isMinor ? blank(v.guardianPhone) : null,
      guardian_relation: isMinor ? blank(v.guardianRelation) : null,
      guardian_consent_path: isMinor ? blank(v.guardianConsentPath) : null,
      notify_next_round: v.notifyNextRound,
      utm_source: blank(v.utmSource),
      utm_medium: blank(v.utmMedium),
      utm_campaign: blank(v.utmCampaign),
      landing_path: blank(v.landingPath),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "이미 이번 회차에 신청하셨어요." };
    // DB 트리거가 막은 경우 — 사람이 읽을 수 있는 메시지를 그대로 쓴다.
    if (error.code === "23514" || /만 15세|보호자/.test(error.message)) {
      return { error: error.message };
    }
    return { error: "접수에 실패했어요. 잠시 후 다시 시도해주세요." };
  }

  // 다음 회차 알림 대기열 — 탈락해도 재접촉할 채널을 지금 확보한다.
  if (v.notifyNextRound) {
    await admin
      .from("casting_waitlist")
      .upsert({ profile_id: me.id, source: "applied" }, { onConflict: "profile_id" });
  }

  const names = (joined ?? [])
    .map((r) => (Array.isArray(r.photographer) ? r.photographer[0] : r.photographer) as { display_name?: string } | null)
    .map((p) => p?.display_name)
    .filter((n): n is string => Boolean(n));

  await notifyOpsNewCastingApplication({
    applicationId: inserted.id as string,
    roundTitle: round.title as string,
    age: gate.age,
    isMinor,
    hasGuardianConsent: Boolean(blank(v.guardianConsentPath)),
    photographerNames: names,
  });

  // PII 는 보내지 않는다 — 파생 불리언과 개수만.
  await mpTrackServer(
    "Casting Submit",
    me.id,
    {
      round_slug: round.slug,
      is_minor: isMinor,
      picked_photo_count: v.photoIds.length,
      photographer_count: photographerIds.length,
      photo_count: v.photoPaths.length,
      consent_sns: v.consentSns,
      consent_paid_ad: v.consentPaidAd,
      utm_source: blank(v.utmSource),
    },
    `Casting Submit:${inserted.id}`,
  );

  return { ok: true };
}

/** 마감 중 유입·탈락자를 다음 회차 대기열에 넣는다. */
export async function joinCastingWaitlist(): Promise<CastingState> {
  const me = await getCurrentUser();
  if (!me) return { error: "로그인이 필요해요." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("casting_waitlist")
    .upsert({ profile_id: me.id, source: "closed_round" }, { onConflict: "profile_id" });
  if (error) return { error: "잠시 후 다시 시도해주세요." };

  await mpTrackServer("Casting Waitlist Join", me.id, {}, `Casting Waitlist:${me.id}`);
  return { ok: true };
}

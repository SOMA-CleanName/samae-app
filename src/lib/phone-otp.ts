import "server-only";
import { createHash, randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";

// 전화번호 OTP — 발급·검증 (phone_verifications 테이블, service role 전용).
// 정책: 코드 6자리 · 유효 3분 · 검증 5회 실패 시 폐기 · 재발송 60초 쿨다운 ·
//       사용자/번호당 시간당 5회 발송 제한 (요금 폭탄·브루트포스 방지)

const CODE_TTL_MS = 3 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const HOURLY_SEND_LIMIT = 5;
const MAX_ATTEMPTS = 5;

// 해시 페퍼 — 전용 env 가 없으면 service role 키를 재활용 (DB 유출 단독으로는 코드 복원 불가)
const pepper = () => process.env.OTP_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const hashCode = (code: string) => createHash("sha256").update(code + pepper()).digest("hex");

export type OtpRequestResult =
  | { ok: true; devCode?: string }
  | { ok: false; error: string; retryAfterSec?: number };

export async function requestOtp(userId: string, phone: string): Promise<OtpRequestResult> {
  const admin = createAdminClient();
  const now = Date.now();

  // 레이트리밋 — 사용자 기준 최근 발송 이력
  const { data: recent } = await admin
    .from("phone_verifications")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", new Date(now - 3600_000).toISOString())
    .order("created_at", { ascending: false });
  if (recent && recent.length > 0) {
    const lastMs = new Date(recent[0].created_at as string).getTime();
    if (now - lastMs < RESEND_COOLDOWN_MS)
      return {
        ok: false,
        error: "잠시 후 다시 받을 수 있어요.",
        retryAfterSec: Math.ceil((RESEND_COOLDOWN_MS - (now - lastMs)) / 1000),
      };
    if (recent.length >= HOURLY_SEND_LIMIT)
      return { ok: false, error: "발송 한도를 넘었어요. 1시간 뒤에 다시 시도해 주세요." };
  }
  // 같은 번호로도 시간당 한도 (계정 갈아타며 특정 번호 폭격 방지)
  const { count: phoneCount } = await admin
    .from("phone_verifications")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", new Date(now - 3600_000).toISOString());
  if ((phoneCount ?? 0) >= HOURLY_SEND_LIMIT)
    return { ok: false, error: "이 번호로 발송이 많았어요. 1시간 뒤에 다시 시도해 주세요." };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await admin.from("phone_verifications").insert({
    user_id: userId,
    phone,
    code_hash: hashCode(code),
    expires_at: new Date(now + CODE_TTL_MS).toISOString(),
  });
  if (error) return { ok: false, error: "잠시 후 다시 시도해 주세요." };

  const sent = await sendSms(phone, `[사매] 인증번호 ${code} — 3분 안에 입력해 주세요.`);
  if (!sent.ok) return { ok: false, error: sent.error ?? "문자 발송에 실패했어요." };

  // dev 스텁 발송이면 코드를 화면에 노출해 실기기 없이 테스트 가능하게 (프로덕션 절대 금지)
  const devCode = sent.stub && process.env.NODE_ENV !== "production" ? code : undefined;
  return { ok: true, devCode };
}

export type OtpVerifyResult = { ok: true } | { ok: false; error: string };

export async function verifyOtp(userId: string, phone: string, code: string): Promise<OtpVerifyResult> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("phone_verifications")
    .select("id, code_hash, attempts, expires_at, verified_at")
    .eq("user_id", userId)
    .eq("phone", phone)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return { ok: false, error: "인증번호를 먼저 받아주세요." };
  if (new Date(row.expires_at as string).getTime() < Date.now())
    return { ok: false, error: "인증번호가 만료됐어요. 다시 받아주세요." };
  if ((row.attempts as number) >= MAX_ATTEMPTS)
    return { ok: false, error: "시도 횟수를 넘었어요. 인증번호를 다시 받아주세요." };

  if (row.code_hash !== hashCode(code.trim())) {
    await admin
      .from("phone_verifications")
      .update({ attempts: (row.attempts as number) + 1 })
      .eq("id", row.id);
    return { ok: false, error: "인증번호가 맞지 않아요. 다시 확인해 주세요." };
  }

  await admin.from("phone_verifications").update({ verified_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true };
}

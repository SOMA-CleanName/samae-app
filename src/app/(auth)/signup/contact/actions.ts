"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { requestOtp, verifyOtp } from "@/lib/phone-otp";

// 가입 마무리 — 전화번호 OTP 인증 후 profiles.phone 저장.
// SMS(작가 답장 알림)의 유일한 채널이라 형식 검증이 아니라 실수신 검증을 한다.

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11 || !digits.startsWith("01")) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export type RequestCodeState = {
  ok: boolean;
  error: string | null;
  /** 정규화된 번호 — 성공 시 코드 입력 단계로 넘어가며 이 번호로 검증 */
  phone?: string;
  /** dev 스텁 발송일 때만 — 실기기 없이 테스트용 코드 노출 (프로덕션 항상 없음) */
  devCode?: string;
  retryAfterSec?: number;
};

export async function requestPhoneCode(
  _prev: RequestCodeState | null,
  formData: FormData
): Promise<RequestCodeState> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요. 다시 로그인해 주세요." };

  const phone = normalizePhone(String(formData.get("phone") || ""));
  if (!phone) return { ok: false, error: "010으로 시작하는 11자리 번호를 입력해주세요." };

  const res = await requestOtp(me.id, phone);
  if (!res.ok) return { ok: false, error: res.error, retryAfterSec: res.retryAfterSec };
  return { ok: true, error: null, phone, devCode: res.devCode };
}

export type VerifyCodeState = { ok: boolean; error: string | null };

export async function verifyPhoneCode(
  _prev: VerifyCodeState | null,
  formData: FormData
): Promise<VerifyCodeState> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요. 다시 로그인해 주세요." };

  const phone = normalizePhone(String(formData.get("phone") || ""));
  const code = String(formData.get("code") || "").replace(/\D/g, "");
  if (!phone) return { ok: false, error: "번호가 올바르지 않아요. 처음부터 다시 시도해 주세요." };
  if (code.length !== 6) return { ok: false, error: "인증번호 6자리를 입력해주세요." };

  const res = await verifyOtp(me.id, phone, code);
  if (!res.ok) return { ok: false, error: res.error };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ phone }).eq("id", me.id);
  if (error) return { ok: false, error: "저장에 실패했어요. 잠시 후 다시 시도해 주세요." };
  return { ok: true, error: null };
}

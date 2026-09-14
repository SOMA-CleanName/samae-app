"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { recordTermsConsent } from "@/lib/consent";
import { safeNext } from "@/lib/safe-redirect";

/**
 * 회원약관·개인정보처리방침 동의 기록.
 *
 * 체크 두 개가 모두 있어야 한다 — 하나로 뭉뚱그리면 "정책에 동의합니다" 와 같아서 설명 의무를
 * 못 채운다(약관규제법 3조). 기록은 profiles.terms_agreed_at 에 한 번만 남긴다.
 */
export async function agreeTerms(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const terms = formData.get("terms") === "on";
  const privacy = formData.get("privacy") === "on";
  if (!terms || !privacy) throw new Error("서비스 이용약관과 개인정보 처리방침에 모두 동의해야 계속할 수 있어요.");

  await recordTermsConsent(me.id);
  redirect(safeNext(String(formData.get("next") || ""), "/"));
}

/** 이메일 가입 직후(세션이 생긴 뒤) 폼에서 이미 체크한 동의를 기록한다 */
export async function recordSignupConsent(): Promise<void> {
  const me = await getCurrentUser();
  if (!me) return;
  await recordTermsConsent(me.id);
}

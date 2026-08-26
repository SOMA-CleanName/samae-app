"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export type SaveContactState = { ok: boolean; error: string | null };

// 가입 직후 연락처(전화번호) 등록 — SMS 알림(작가 답장 재소환)의 유일한 채널이라
// 소셜 로그인으로 못 받는 번호를 이 단계에서 1회 수집한다.
export async function saveContactPhone(
  _prev: SaveContactState,
  formData: FormData
): Promise<SaveContactState> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요. 다시 로그인해 주세요." };

  const digits = String(formData.get("phone") || "").replace(/\D/g, "");
  if (digits.length !== 11 || !digits.startsWith("01"))
    return { ok: false, error: "010으로 시작하는 11자리 번호를 입력해주세요." };
  const phone = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ phone }).eq("id", me.id);
  if (error) return { ok: false, error: "저장에 실패했어요. 잠시 후 다시 시도해 주세요." };
  return { ok: true, error: null };
}

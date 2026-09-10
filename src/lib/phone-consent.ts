import "server-only";
import { createClient } from "@/lib/supabase/server";
import { kakaoPhoneScopeEnabled } from "@/lib/kakao-phone";

// "이 사람에게 전화번호를 어떻게 물을 것인가" 한 곳에서 판정한다.
//
// 번호를 받는 길이 둘이라 화면마다 따로 따지면 금방 어긋난다.
//   · 카카오 재동의 — 버튼 한 번. 카카오 계정이고 검수가 통과했을 때만 가능
//   · OTP(/signup/contact) — 번호 입력 + 문자 6자리. 언제나 가능하지만 마찰이 크다
//
// 그래서 화면은 "무엇을 보여줄까" 만 묻고, 조건 판단은 전부 여기서 한다.

export type PhoneConsentState = {
  /** 이미 번호가 있다 → 아무것도 물을 필요 없다 */
  hasPhone: boolean;
  /** 카카오 재동의로 받을 수 있다 (카카오 계정 + 검수 통과) */
  canAskKakao: boolean;
  /** 저장된 번호. 설정 화면이 마스킹해 보여준다. 없으면 null */
  phone: string | null;
};

/** `010-1234-5678` → `010-****-5678`. 본인 확인에는 충분하고 어깨너머로는 안 읽힌다. */
export function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})-?(\d{3,4})-?(\d{4})$/, "$1-****-$3");
}

/** 번호가 없고, 카카오로 물을 수도 없다 → OTP 로 보내야 한다 */
export function needsOtpFallback(s: PhoneConsentState): boolean {
  return !s.hasPhone && !s.canAskKakao;
}

/**
 * 로그인 사용자의 전화번호 수집 상태. 비로그인이면 `hasPhone: true` 로 돌려
 * 호출부가 아무것도 그리지 않게 한다 (로그인 유도는 각 화면의 몫이지 여기 일이 아니다).
 */
export async function loadPhoneConsentState(): Promise<PhoneConsentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { hasPhone: true, canAskKakao: false, phone: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .maybeSingle();

  // 카카오 계정인가 — 이메일로 가입한 사람에게 카카오 동의를 권하면 안 된다.
  // 계정이 연결돼 있지 않으니 동의를 받아도 이 프로필로 번호가 들어오지 않는다.
  // identities 가 진실이고, app_metadata.provider 는 구 세션 폴백이다.
  const hasKakaoIdentity =
    (user.identities ?? []).some((i) => i.provider === "kakao") ||
    user.app_metadata?.provider === "kakao";

  const phone = (profile?.phone as string | null) ?? null;
  return {
    hasPhone: !!phone,
    canAskKakao: hasKakaoIdentity && kakaoPhoneScopeEnabled(),
    phone,
  };
}

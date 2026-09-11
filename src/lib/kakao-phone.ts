/**
 * 카카오싱크로 받은 전화번호 → profiles.phone 형식으로 정규화.
 *
 * **왜 필요한가.** 카카오 로그인만으로는 번호가 안 온다. 그래서 지금은 소셜 가입 직후
 * `/signup/contact` 에서 번호를 직접 치고 OTP 6자리까지 받는다 — 간편가입을 눌렀는데
 * 결국 타이핑 두 번을 더 하는 셈이라, 여기가 가입 퍼널에서 제일 두꺼운 벽이다.
 *
 * 카카오싱크 동의항목에 `phone_number` 가 붙으면 동의 한 번으로 번호가 넘어온다.
 * 카카오가 이미 검증한 번호라 **우리 OTP 도 통째로 필요 없어진다.**
 *
 * ⚠️ 카카오가 주는 형식은 국제 표기다 — `+82 10-1234-5678`.
 *    DB(profiles.phone)와 알림톡 발송은 `010-1234-5678` 를 쓰므로 여기서 맞춘다.
 *    (contact/actions.ts 의 normalizePhone 과 같은 출력이어야 한다)
 */

/** 카카오 응답에서 전화번호가 실릴 수 있는 자리들. 공급자·SDK 버전에 따라 갈린다. */
const PHONE_KEYS = ["phone_number", "phoneNumber", "phone"] as const;

/**
 * `+82 10-1234-5678` · `+8210-1234-5678` · `010-1234-5678` → `010-1234-5678`
 *
 * 국내 번호가 아니면 null. 알림톡은 국내 번호로만 나가고, 억지로 저장해 두면
 * 발송 실패가 "번호는 있는데 안 가는" 형태로 조용히 쌓인다.
 */
export function normalizeKakaoPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = String(raw).trim();
  // 국가번호 처리 — +82 는 0 으로 치환하고, 그 외 국가번호는 받지 않는다
  let digits: string;
  if (trimmed.startsWith("+")) {
    if (!trimmed.startsWith("+82")) return null;
    digits = "0" + trimmed.slice(3).replace(/\D/g, "");
  } else {
    digits = trimmed.replace(/\D/g, "");
  }

  // 휴대폰만 — 알림톡·SMS 가 유선번호로는 안 간다
  if (digits.length !== 11 || !digits.startsWith("01")) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/**
 * Supabase user_metadata 에서 카카오 전화번호를 꺼낸다.
 *
 * ⚠️ **실제로는 여기서 거의 안 나온다**(2026-09-11 실측). Supabase GoTrue 의 카카오
 *    provider 는 닉네임·이메일·프로필사진만 user_metadata 로 매핑하고
 *    `kakao_account.phone_number` 는 버린다. 동의를 받아도 metadata 키 목록에
 *    전화번호가 아예 없다(`phone_verified` 만 덩그러니 남는다).
 *    그래서 실질적인 수집 경로는 `fetchKakaoPhoneFromApi()` 다.
 *
 * 그럼에도 이 함수를 남겨 두는 이유 — GoTrue 가 나중에 매핑을 넓히면 API 왕복
 * 없이 끝나고, 그때 코드를 고칠 필요가 없다. 먼저 여기를 보고 없으면 API 로 간다.
 */
export function extractKakaoPhone(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as Record<string, unknown>;

  for (const key of PHONE_KEYS) {
    const found = normalizeKakaoPhone(meta[key] as string | undefined);
    if (found) return found;
  }

  // 중첩 — kakao_account.phone_number 형태로 통째로 들어오는 경우
  const account = meta.kakao_account;
  if (account && typeof account === "object") {
    for (const key of PHONE_KEYS) {
      const found = normalizeKakaoPhone((account as Record<string, unknown>)[key] as string | undefined);
      if (found) return found;
    }
  }

  return null;
}

/**
 * 카카오 API 를 직접 쳐서 전화번호를 가져온다. **이게 실제로 번호가 오는 경로다.**
 *
 * Supabase 가 `kakao_account.phone_number` 를 user_metadata 로 안 넘겨 주기 때문에
 * (위 extractKakaoPhone 주석 참고), 로그인 콜백에서 받은 provider_token 으로
 * 카카오에 한 번 더 묻는다. 사용자가 동의를 이미 했으므로 이 토큰에는 권한이 있다.
 *
 * 실패는 전부 null 로 접는다 — 로그인 흐름을 막을 이유가 없다. 못 받으면
 * `/signup/contact` 의 OTP 가 받아 준다.
 *
 * @param providerToken `exchangeCodeForSession` 응답의 `session.provider_token`.
 *                      Supabase 는 이걸 저장하지 않으므로 **콜백 그 순간에만** 쓸 수 있다.
 */
export async function fetchKakaoPhoneFromApi(
  providerToken: string | null | undefined
): Promise<string | null> {
  if (!providerToken) return null;

  try {
    // 로그인 흐름 한복판이라 카카오가 느릴 때 무한정 기다리면 안 된다.
    const res = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${providerToken}` },
      // 토큰이 매번 다르므로 캐시가 섞이면 남의 번호를 집는다
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;

    // 응답은 `{ id, kakao_account: { phone_number: "+82 10-1234-5678", ... } }`.
    // 중첩 처리는 extractKakaoPhone 이 이미 한다.
    return extractKakaoPhone(await res.json());
  } catch {
    return null; // 타임아웃·네트워크·JSON 파싱 전부 여기로
  }
}

/** 전화번호 동의항목 이름 — 가입 때도, 나중에 다시 물을 때도 같은 값을 쓴다. */
export const KAKAO_PHONE_SCOPE = "phone_number";

/**
 * 전화번호 동의항목을 요청해도 되는가.
 *
 * ⚠️ **검수 안 된 scope 를 요청하면 카카오가 로그인 자체를 거절한다**(KOE205).
 *    그래서 env 스위치 뒤에 둔다 — 검수가 통과한 뒤 `NEXT_PUBLIC_KAKAO_PHONE_SCOPE=on`
 *    을 켜면 코드 수정 없이 활성화된다. 떨어지면 끈 채로 두면 되고, 그때는 지금과
 *    완전히 같이 동작한다(= OTP 경로만 남는다).
 *
 * 스위치가 꺼져 있으면 재동의 버튼도 **화면에 뜨면 안 된다.** 눌러 봐야 로그인이 깨진다.
 */
export function kakaoPhoneScopeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_KAKAO_PHONE_SCOPE === "on";
}

/**
 * 최초 로그인 요청에 실을 동의항목.
 *
 * 전화번호는 **선택 동의**로 심사받았다(2026-09-10). 필수로 걸면 동의를 거부한 사람이
 * 가입 자체를 못 하고, 카카오 심사도 "없으면 서비스가 불가능한 항목"만 필수로 인정한다.
 * 대신 간편가입 동의 화면의 [전체 동의하기]로 대부분 함께 수집되고, 빠진 사람은
 * `KakaoPhoneConsentButton` 이 나중에 다시 묻는다.
 */
export function kakaoScopes(): string | undefined {
  return kakaoPhoneScopeEnabled()
    ? `profile_nickname account_email ${KAKAO_PHONE_SCOPE}`
    : undefined;
}

/**
 * 나중에 전화번호만 다시 물을 때 실을 동의항목.
 *
 * 이미 동의한 항목은 카카오가 화면에서 빼 주므로 **전화번호 한 줄만** 뜬다.
 * 이미 다 동의한 사람이 눌러도 그냥 통과해서 돌아온다(무해).
 */
export function kakaoPhoneReconsentScopes(): string | undefined {
  return kakaoPhoneScopeEnabled() ? KAKAO_PHONE_SCOPE : undefined;
}

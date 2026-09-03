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
 * 키 이름을 하나로 못 박지 않은 이유 — Supabase 의 카카오 provider 가 `kakao_account`
 * 를 어떤 키로 펼치는지가 버전에 따라 다르고, 검수 통과 전에는 실물을 볼 수 없다.
 * 후보를 훑고 **하나라도 정규화에 성공하면 채택**한다. 못 찾으면 null 이고,
 * 그때는 기존 OTP 흐름이 그대로 돈다(§callback/route.ts).
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
 * 로그인 요청에 실을 카카오 동의항목.
 *
 * ⚠️ **검수 안 된 scope 를 요청하면 카카오가 로그인 자체를 거절한다**(KOE205).
 *    그래서 `phone_number` 는 env 스위치 뒤에 둔다 — 카카오싱크 검수가 통과한 뒤
 *    `NEXT_PUBLIC_KAKAO_PHONE_SCOPE=on` 을 켜면 코드 수정 없이 활성화된다.
 *    떨어지면 스위치를 끈 채로 두면 되고, 그때는 지금과 완전히 같이 동작한다.
 */
export function kakaoScopes(): string | undefined {
  return process.env.NEXT_PUBLIC_KAKAO_PHONE_SCOPE === "on"
    ? "profile_nickname account_email phone_number"
    : undefined;
}

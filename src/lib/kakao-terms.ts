import "server-only";

// 카카오 간편가입에서 받은 **서비스 약관 동의**를 우리 기록으로 가져온다.
//
// 지금까지는 카카오가 약관을 안 받았고(콘솔의 간편가입이 OFF), 우리가 계정 생성 **뒤에**
// `/signup/consent` 로 받았다. 순서가 뒤집혀 있었다 — 계정이 먼저 생기고 동의가 나중이다.
//
// 간편가입을 켜면 카카오 동의 화면에서 약관까지 함께 받는다. 그러면 동의 시점이 가입
// 시점과 정확히 일치하고, 화면도 하나 줄어든다. 다만 **카카오가 받은 동의는 카카오에만
// 남으므로** 여기서 끌어와 `profiles.terms_agreed_at` 에 굳혀야 우리 쪽 판정
// (`needsTermsConsent`)이 그걸 알아본다. 안 그러면 카카오에서 동의하고도 우리 동의
// 화면을 또 보게 된다.
//
// 참고: https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#service-terms

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordTermsConsent } from "@/lib/consent";

/**
 * 콘솔의 간편가입에 등록한 약관 **태그**. 쉼표로 여러 개.
 *
 * 태그는 콘솔에서 사람이 정하는 값이라 코드에 박으면 둘이 어긋난다. env 로 두면
 * 콘솔에서 태그를 바꿔도 배포 없이 맞출 수 있다. 비어 있으면 이 기능 전체가 no-op —
 * 간편가입을 아직 안 켰을 때 조용히 지나가야 한다(지금이 그 상태다).
 */
function requiredTags(): string[] {
  return (process.env.KAKAO_TERMS_TAGS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

type ServiceTermsResponse = {
  allowed_service_terms?: { tag?: string; agreed_at?: string }[];
};

/** 이 사용자가 카카오에서 동의한 약관 태그들 */
export async function fetchKakaoAgreedTermTags(
  providerToken: string | null | undefined
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!providerToken) return out;

  try {
    // 로그인 흐름 한복판이다 — 카카오가 느릴 때 무한정 기다리면 가입이 멈춘다.
    const res = await fetch("https://kapi.kakao.com/v2/user/service_terms", {
      headers: { Authorization: `Bearer ${providerToken}` },
      // 토큰이 매번 다르므로 캐시가 섞이면 남의 동의를 집는다
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return out;

    const json = (await res.json()) as ServiceTermsResponse;
    for (const t of json.allowed_service_terms ?? []) {
      // agreed_at 이 있는 것만 — 목록에 있다고 동의한 건 아니다
      if (t.tag && t.agreed_at) out.add(t.tag);
    }
  } catch {
    // 타임아웃·네트워크·JSON 파싱 전부 여기로. 실패하면 /signup/consent 가 받는다.
  }
  return out;
}

/**
 * 카카오에서 필수 약관에 전부 동의했으면 우리 기록에 굳힌다.
 *
 * ⚠️ **하나라도 빠지면 기록하지 않는다.** 일부만 동의한 걸 "동의했다" 로 적으면,
 *    나중에 "어느 약관에 동의했나" 를 물었을 때 댈 근거가 없다. 그 경우는 그대로
 *    `/signup/consent` 로 보내 우리 화면에서 두 항목을 다시 받는다.
 *
 * @returns 기록했으면 true (= 우리 동의 화면을 건너뛰어도 된다)
 */
export async function adoptKakaoServiceTerms(
  supabase: SupabaseClient,
  providerToken: string | null | undefined
): Promise<boolean> {
  const tags = requiredTags();
  if (tags.length === 0) return false; // 간편가입 미설정 — 지금은 여기서 끝난다

  const agreed = await fetchKakaoAgreedTermTags(providerToken);
  if (!tags.every((t) => agreed.has(t))) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // 이미 동의 기록이 있으면 덮어쓰지 않는다 (recordTermsConsent 가 is-null 조건부)
  await recordTermsConsent(user.id);
  return true;
}

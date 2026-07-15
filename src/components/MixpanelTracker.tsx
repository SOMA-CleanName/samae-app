"use client";

import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  mpEnabled,
  mpIdentify,
  mpPeople,
  mpRegister,
  mpReset,
  mpTrack,
  mpDistinctId,
  mpOptIn,
} from "@/lib/mixpanel";

// Mixpanel 라이프사이클 — 로그인 유저 식별(identify) + 가입/로그인 이벤트 + role 속성.
// 스태프(운영자·작가) 처리: opt-out(전체 차단)이 아니라 super 속성 is_staff=true 태그만 단다.
//   → 이벤트는 계속 수집되므로 세션 리플레이엔 그대로 잡히고,
//     퍼널·플로우 리포트에서 "is_staff ≠ true" 필터로 제외한다.
// 익명 방문자는 읽기 쉬운 표시이름($name)="{광고콘셉}-{짧은ID}" 부여.
// (Page View·Click·Scroll 등 자동 이벤트는 AnalyticsTracker 에서 함께 전송)

const SIGNUP_WINDOW_MS = 5 * 60 * 1000; // created_at 이 최근 5분 이내면 '가입'으로 간주
const LOGIN_ONCE_KEY = "samae_mp_login"; // 탭 세션당 로그인 이벤트 1회 제한

// utm 으로 유입 광고 콘셉 추론 (표시이름·세그먼트용). AnalyticsTracker 가 세션스토리지에 저장.
function inflowConcept(): string {
  try {
    const utm = JSON.parse(sessionStorage.getItem("samae_utm") || "{}") as {
      utm_source?: string;
      utm_content?: string;
    };
    const content = decodeURIComponent(utm.utm_content || "");
    const src = (utm.utm_source || "").toLowerCase();
    if (/웨딩|wedding/.test(content)) return "웨딩";
    if (/커플|couple/.test(content)) return "커플";
    if (/스냅|snap/.test(content)) return "스냅";
    if (/컨셉|concept/.test(content)) return "컨셉";
    if (/meta|facebook|fb/.test(src)) return "메타";
    if (/insta|ig/.test(src)) return "스토리";
    return "직접";
  } catch {
    return "직접";
  }
}

// 익명 방문자에게 읽기 쉬운 표시이름 부여 — Users·세션 리플레이에서 "$device:.." 대신 노출.
function labelAnonymous() {
  const concept = inflowConcept();
  const short = mpDistinctId().replace(/^\$device:/, "").slice(-4) || "0000";
  mpPeople({ $name: `${concept}-${short}`, 유입콘셉: concept });
}

// 유저 프로필 속성(role·작가상태) 갱신 — 공급/수요 코호트 분리용.
// role = admin > photographer > user (photographers 행 존재로 작가 판단).
async function setUserProps(supabase: SupabaseClient, userId: string) {
  try {
    const [{ data: profile }, { data: photographer }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", userId).single(),
      supabase.from("photographers").select("status").eq("profile_id", userId).maybeSingle(),
    ]);
    const role =
      profile?.role === "admin" ? "admin" : photographer ? "photographer" : "user";
    mpPeople({
      role,
      ...(photographer ? { photographer_status: photographer.status } : {}),
    });
    // 스태프는 추적을 끊지 않고(리플레이 유지) is_staff 태그만 → 퍼널·플로우는 리포트 필터로 제외
    mpRegister({ is_staff: role === "admin" || role === "photographer" });
  } catch {
    /* 무시 */
  }
}

export function MixpanelTracker() {
  useEffect(() => {
    if (!mpEnabled()) return;
    // 이전 배포에서 스태프로 opt-out 됐던 브라우저 복구(리플레이 위해 스태프도 추적 유지) +
    // is_staff 기본값 false 등록(스태프면 setUserProps 에서 true 로 덮음).
    mpOptIn();
    mpRegister({ is_staff: false });
    const supabase = createClient();

    // 최초 세션 복원 시 — 이벤트 없이 식별만 (새로고침마다 로그인 카운트 방지)
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (u) {
        mpIdentify(u.id, { signup_at: u.created_at, provider: u.app_metadata?.provider });
        setUserProps(supabase, u.id);
      } else {
        // 익명 방문자 — 읽기 쉬운 표시이름 부여 (utm 캡처 뒤 실행되도록 다음 틱)
        setTimeout(labelAnonymous, 0);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user;
      if (event === "SIGNED_IN" && u) {
        mpIdentify(u.id, { signup_at: u.created_at, provider: u.app_metadata?.provider });
        setUserProps(supabase, u.id);
        const method = (u.app_metadata?.provider as string) || "email";
        const isNew = !!u.created_at && Date.now() - new Date(u.created_at).getTime() < SIGNUP_WINDOW_MS;
        if (isNew) {
          // 가입은 유저당 1회만
          const key = `samae_mp_su_${u.id}`;
          try {
            if (!localStorage.getItem(key)) {
              localStorage.setItem(key, "1");
              mpTrack("Sign Up", { method });
            }
          } catch {
            mpTrack("Sign Up", { method });
          }
        } else {
          // 로그인은 탭 세션당 1회 (세션 복원 재발화로 인한 과다 카운트 방지)
          try {
            if (!sessionStorage.getItem(LOGIN_ONCE_KEY)) {
              sessionStorage.setItem(LOGIN_ONCE_KEY, "1");
              mpTrack("Log In", { method });
            }
          } catch {
            mpTrack("Log In", { method });
          }
        }
      } else if (event === "SIGNED_OUT") {
        try {
          sessionStorage.removeItem(LOGIN_ONCE_KEY);
        } catch {
          /* 무시 */
        }
        mpReset();
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}

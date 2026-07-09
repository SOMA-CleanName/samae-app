"use client";

import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { mpEnabled, mpIdentify, mpPeople, mpReset, mpTrack } from "@/lib/mixpanel";

// Mixpanel 라이프사이클 — 로그인 유저 식별(identify) + 가입/로그인 이벤트 + role 속성.
// (Page View·Click·Scroll 등 자동 이벤트는 AnalyticsTracker 에서 함께 전송)

const SIGNUP_WINDOW_MS = 5 * 60 * 1000; // created_at 이 최근 5분 이내면 '가입'으로 간주
const LOGIN_ONCE_KEY = "samae_mp_login"; // 탭 세션당 로그인 이벤트 1회 제한

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
  } catch {
    /* 무시 */
  }
}

export function MixpanelTracker() {
  useEffect(() => {
    if (!mpEnabled()) return;
    const supabase = createClient();

    // 최초 세션 복원 시 — 이벤트 없이 식별만 (새로고침마다 로그인 카운트 방지)
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (u) {
        mpIdentify(u.id, { signup_at: u.created_at, provider: u.app_metadata?.provider });
        setUserProps(supabase, u.id);
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

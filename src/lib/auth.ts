import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  role: "user" | "admin";
  displayName: string | null;
  avatarUrl: string | null;
  /** 작가 자격 보유 시 작가 정보, 아니면 null (= "작가 여부는 photographers 행으로 판단") */
  photographer: { id: string; displayName: string; status: string } | null;
  /**
   * 아직 처리되지 않은 작가 신청이 있는가.
   *
   * 승인 전에는 photographers 행이 없어 photographer 가 null 이다. 그런데 /studio 는
   * 신청 상태별 분기를 이미 갖고 있어 **신청자도 들어갈 수 있는 지면**이다. 이 값이
   * 없으면 신청해 놓고 들어갈 길이 주소뿐이었다(2026-09-17 신고).
   */
  hasPendingApplication: boolean;
};

/**
 * 현재 로그인 사용자 + 프로필 + 작가 자격을 한 번에 조회.
 * 비로그인이면 null.
 *
 * React cache() 로 감싸 같은 요청 안에서는 한 번만 실행된다
 * (레이아웃·페이지·서버액션이 중복 호출해도 Supabase 왕복은 1세트).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 프로필·작가 조회는 서로 독립적이므로 병렬로 (왕복 1회 절약)
  const [{ data: profile }, { data: photographer }, { count: pendingApps }] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, display_name, avatar_url")
      .eq("id", user.id)
      .single(),
    supabase
      .from("photographers")
      .select("id, display_name, status")
      .eq("profile_id", user.id)
      .maybeSingle(),
    // 처리 전 신청만 센다. head:true 라 행은 안 실려 온다 — 위 둘과 병렬이라 왕복도 안 는다
    supabase
      .from("photographer_applications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .in("status", ["new", "contacted"]),
  ]);

  return {
    id: user.id,
    email: user.email ?? null,
    role: (profile?.role as "user" | "admin") ?? "user",
    displayName: profile?.display_name ?? null,
    // `""` 는 "이니셜을 택함"(settings removeAvatar) — 화면에서는 null 과 같이 다룬다
    avatarUrl: profile?.avatar_url || null,
    hasPendingApplication: (pendingApps ?? 0) > 0,
    photographer: photographer
      ? {
          id: photographer.id,
          displayName: photographer.display_name ?? "작가",
          status: photographer.status,
        }
      : null,
  };
});

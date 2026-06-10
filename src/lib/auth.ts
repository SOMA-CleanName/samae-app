import "server-only";

import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  role: "user" | "admin";
  displayName: string | null;
  avatarUrl: string | null;
  /** 작가 자격 보유 시 작가 정보, 아니면 null (= "작가 여부는 photographers 행으로 판단") */
  photographer: { id: string; displayName: string; status: string } | null;
};

/**
 * 현재 로그인 사용자 + 프로필 + 작가 자격을 한 번에 조회.
 * 비로그인이면 null.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  const { data: photographer } = await supabase
    .from("photographers")
    .select("id, display_name, status")
    .eq("profile_id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    role: (profile?.role as "user" | "admin") ?? "user",
    displayName: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    photographer: photographer
      ? {
          id: photographer.id,
          displayName: photographer.display_name ?? "작가",
          status: photographer.status,
        }
      : null,
  };
}

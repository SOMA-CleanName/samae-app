"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mpTrackServer } from "@/lib/mixpanel-server";

// 로그아웃 — 세션 종료 후 홈 화면으로
export async function signOut() {
  const supabase = await createClient();
  // 세션 종료 전에 유저 id 확보 → 이탈/리텐션 분석용 Log Out 이벤트
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await mpTrackServer("Log Out", user.id);
  await supabase.auth.signOut();
  redirect("/");
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 로그아웃 — 세션 종료 후 로그인 페이지로
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

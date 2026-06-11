"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

// 닉네임(profiles.display_name) 수정 — 본인만(RLS check id=auth.uid()).
export async function updateDisplayName(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/settings");

  const name = String(formData.get("displayName") || "").trim().slice(0, 30);
  if (!name) throw new Error("닉네임을 입력해주세요.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", me.id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/", "layout"); // 헤더 아바타 메뉴 등 갱신
}

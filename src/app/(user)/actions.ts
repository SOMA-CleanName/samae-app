"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// 찜 토글 (작가/사진). 비로그인이면 로그인으로.
export async function toggleFavorite(formData: FormData) {
  const targetType = String(formData.get("targetType"));
  const targetId = String(formData.get("targetId"));
  const handle = String(formData.get("handle") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/photographers/${handle}`);

  const { data: existing } = await supabase
    .from("favorites")
    .select("id")
    .eq("profile_id", user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();

  if (existing) {
    await supabase.from("favorites").delete().eq("id", existing.id);
  } else {
    await supabase
      .from("favorites")
      .insert({ profile_id: user.id, target_type: targetType, target_id: targetId });
  }

  if (handle) revalidatePath(`/photographers/${handle}`);
  revalidatePath("/favorites");
}

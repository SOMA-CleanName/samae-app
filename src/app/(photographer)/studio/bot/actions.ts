"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_SCRIPT_QUESTIONS } from "@/lib/photographer-scripts";

// 커스텀 챗봇 대본 저장 — 작가 본인 확인 후 upsert.
// (RLS insert/update 정책도 있지만, upsert 편의를 위해 소유 검증 후 admin 으로 쓴다)
export async function savePhotographerBotScript(formData: FormData) {
  const me = await getCurrentUser();
  if (!me?.photographer) redirect("/studio");

  const tone = String(formData.get("tone") || "")
    .trim()
    .slice(0, 300);
  const questions: string[] = [];
  for (let i = 0; i < MAX_SCRIPT_QUESTIONS; i++) {
    const q = String(formData.get(`question${i}`) || "").trim();
    if (q) questions.push(q.slice(0, 200));
  }

  const admin = createAdminClient();
  const { error } = await admin.from("photographer_bot_scripts").upsert({
    photographer_id: me.photographer.id,
    tone,
    custom_questions: questions,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/studio/bot");
  redirect("/studio/bot?saved=1");
}

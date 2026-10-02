"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { appendPhotoFamilyName, appendPhotoMoodName, loadPhotoFamilies } from "@/lib/mood-photo-layers-data";

/**
 * 큰 무드(D5)에 이름 붙이기 — 사람이 직접 짓는다(사람 결정 2026-10-01).
 * 기록은 mood-edits/photo-mood-names.jsonl 에 한 줄씩 — 번호가 아니라 지금의 식구 묶음과 함께 남겨, 다시 뭉쳐도 따라간다.
 * 빈 이름을 보내면 이름을 지운다.
 */
export async function nameBigMood(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id") ?? "").trim();
  const data = await loadPhotoFamilies();
  const mood = data?.moods.find((m) => m.id === id);
  if (!data || !mood) return;
  const byId = new Map(data.families.map((f) => [f.id, f]));
  const members = mood.families.flatMap((fid) => byId.get(fid)?.members ?? []);
  const name = String(formData.get("name") ?? "").trim().slice(0, 30);
  await appendPhotoMoodName({ members, name, at: new Date().toISOString() });
  revalidatePath("/admin/photo-purpose/mood/families/photo");
}

/**
 * 가족(D4)에 이름 붙이기 — Claude 가 임시로 지어 둔 것을 사람이 고친다(사람 결정 2026-10-01).
 * 기록은 mood-edits/photo-family-names.jsonl — 큰 무드와 같이 지금의 식구 묶음과 함께. 여기서 저장하면 사람 이름(by 없음)이다.
 */
export async function nameFamily(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id") ?? "").trim();
  const family = (await loadPhotoFamilies())?.families.find((f) => f.id === id);
  if (!family) return;
  const name = String(formData.get("name") ?? "").trim().slice(0, 30);
  await appendPhotoFamilyName({ members: family.members, name, at: new Date().toISOString() });
  revalidatePath("/admin/photo-purpose/mood/families/photo");
}

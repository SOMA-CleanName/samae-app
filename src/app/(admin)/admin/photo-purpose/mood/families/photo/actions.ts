"use server";

import { revalidatePath } from "next/cache";
import { appendPhotoFamilyName, loadPhotoFamilies } from "@/lib/mood-photo-layers-data";

/**
 * 가족(D4) · 큰 무드(D5)에 이름 붙이기 — 층마다 이름 붙이기는 사람 몫이다(docs/40 §16-2 5번).
 * 기록은 mood-edits/photo-family-names.jsonl 에 한 줄씩 쌓이고 마지막 줄이 이긴다. 빈 이름을 보내면 이름을 지운다.
 * 가족 자체(식구 묶음)는 여기서 건드리지 않는다 — 그건 build_photo_families.py 가 통째로 다시 만든다.
 */
export async function namePhotoFamily(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!/^[fm]\d{2,3}$/.test(id)) return;
  const data = await loadPhotoFamilies();
  const known = data?.families.some((f) => f.id === id) || data?.moods.some((m) => m.id === id);
  if (!known) return;                                     // 없는 가족 · 큰 무드에 이름을 남기면 화면에서 영영 안 보인다
  const name = String(formData.get("name") ?? "").trim().slice(0, 30);
  await appendPhotoFamilyName({ id, name, at: new Date().toISOString() });
  revalidatePath("/admin/photo-purpose/mood/families/photo");
}

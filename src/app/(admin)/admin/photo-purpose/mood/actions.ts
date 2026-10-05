"use server";

import { revalidatePath } from "next/cache";
import { normLabel, type PhotoTermEdit } from "@/lib/mood-photo-terms";
import { appendPhotoTermEdit } from "@/lib/mood-photo-terms-data";

const PATH = "/admin/photo-purpose/mood";
const ACTIONS = new Set<PhotoTermEdit["action"]>(["keep", "drop"]);

/**
 * 사진 무드 표현 하나를 살리거나 뺀다. 규칙(목적 · 관계 · 장소 …)은 그대로 두고 사람 기록만 한 줄 덧붙인다 —
 * 기록은 scripts/embed/mood-edits/photo-term-edits.jsonl, 마지막 줄이 이긴다.
 */
export async function editPhotoTerm(formData: FormData) {
  const label = normLabel(String(formData.get("label") ?? "")).slice(0, 40);
  const action = String(formData.get("action") ?? "") as PhotoTermEdit["action"];
  const to = normLabel(String(formData.get("to") ?? "")).slice(0, 40);
  if (!label || !ACTIONS.has(action)) return;
  await appendPhotoTermEdit({
    label, action,
    ...(action === "keep" && to && to !== label ? { to } : {}),     // 살릴 때 이름을 고쳐 적었으면 그 이름으로(럽스타 감성 → 럽스타)
    at: new Date().toISOString(),
  });
  revalidatePath(PATH);
}

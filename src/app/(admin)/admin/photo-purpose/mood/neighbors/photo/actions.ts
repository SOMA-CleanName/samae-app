"use server";

import { revalidatePath } from "next/cache";
import type { EditAction } from "@/lib/mood-neighbors";
import { appendPhotoNeighborEdit, loadPhotoNeighborBundle } from "@/lib/mood-photo-layers-data";

const ACTIONS = new Set<EditAction>(["add", "remove"]);

/** 사진 무드 표현 뼈대 그래프의 간선 하나를 잇거나 끊는다 — 사전 쪽(neighbors/actions.ts)과 같은 규칙, 기록 파일만 다르다. */
export async function editPhotoEdge(formData: FormData) {
  const a = String(formData.get("a") ?? "").trim();
  const b = String(formData.get("b") ?? "").trim();
  const action = String(formData.get("action") ?? "") as EditAction;
  if (!a || !b || a === b || !ACTIONS.has(action)) return;
  const bundle = await loadPhotoNeighborBundle();
  if (!bundle) return;
  const heads = new Set(bundle.heads);
  if (!heads.has(a) || !heads.has(b)) return;      // 번들에 없는 이름으로 간선을 만들면 화면에서 영영 안 보인다
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  await appendPhotoNeighborEdit({ a, b, action, ...(note ? { note } : {}), at: new Date().toISOString() });
  revalidatePath("/admin/photo-purpose/mood/neighbors/photo");
}

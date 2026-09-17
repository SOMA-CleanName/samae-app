"use server";

import { revalidatePath } from "next/cache";
import { appendEdit, loadNeighborBundle } from "@/lib/mood-neighbors-data";
import type { EditAction } from "@/lib/mood-neighbors";

const PATH = "/admin/photo-purpose/mood/neighbors";
const ACTIONS = new Set<EditAction>(["add", "remove"]);

/**
 * 간선 하나를 잇거나 끊는다. 자동 생성분은 건드리지 않고 수정 기록만 덧붙인다 —
 * 그래프를 다시 만들어도 이 기록이 살아남아 다시 덮인다 (docs/40 §9-5 의 교훈).
 * 되돌리기도 지우지 않고 반대 기록을 한 줄 더 남긴다.
 */
export async function editEdge(formData: FormData) {
  const a = String(formData.get("a") ?? "").trim();
  const b = String(formData.get("b") ?? "").trim();
  const action = String(formData.get("action") ?? "") as EditAction;
  if (!a || !b || a === b || !ACTIONS.has(action)) return;

  // 번들에 없는 낱말로 간선을 만들면 화면에서 영영 안 보인다.
  const bundle = await loadNeighborBundle();
  const heads = new Set(bundle.heads);
  if (!heads.has(a) || !heads.has(b)) return;

  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  await appendEdit({ a, b, action, ...(note ? { note } : {}), at: new Date().toISOString() });
  revalidatePath(PATH);
}

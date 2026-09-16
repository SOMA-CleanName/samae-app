"use server";

import { revalidatePath } from "next/cache";
import { appendTermEdit, loadTermsBundle } from "@/lib/mood-terms-data";
import type { TermAction } from "@/lib/mood-terms";

const PATH = "/admin/photo-purpose/mood/terms";
const ACTIONS = new Set<TermAction>(["rename", "drop", "add"]);

/**
 * 검색어 하나를 고친다. 자동 생성분은 건드리지 않고 수정 기록만 덧붙인다 —
 * 어휘를 다시 정리해도 이 기록이 살아남아 다시 덮인다 (docs/36 §9-5 의 교훈).
 */
export async function editTerm(formData: FormData) {
  const head = String(formData.get("head") ?? "").trim();
  const term = String(formData.get("term") ?? "").trim();
  const action = String(formData.get("action") ?? "") as TermAction;
  const to = String(formData.get("to") ?? "").trim().slice(0, 20);
  if (!head || !term || !ACTIONS.has(action)) return;
  if (action === "rename" && (!to || to === term)) return;   // 빈칸이면 아무것도 안 한다

  // 번들에 없는 묶음으로 기록을 남기면 화면에서 영영 안 보인다.
  const bundle = await loadTermsBundle();
  if (!bundle.rows.some((row) => row.head === head)) return;

  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  await appendTermEdit({
    head, term, action,
    ...(action === "rename" ? { to } : {}),
    ...(note ? { note } : {}),
    at: new Date().toISOString(),
  });
  revalidatePath(PATH);
}

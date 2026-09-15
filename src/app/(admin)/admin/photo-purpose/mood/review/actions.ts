"use server";

import { revalidatePath } from "next/cache";
import { saveVerdict } from "@/lib/mood-review-data";
import type { Verdict } from "@/lib/mood-review";

const PATH = "/admin/photo-purpose/mood/review";
const STATUSES = new Set(["ok", "head", "split", "drop"]);

/**
 * 판정을 파일에 적는다. DB에는 쓰지 않는다 — 이 화면은 임시 검수용이고,
 * 무드 어휘는 아직 어떤 테이블로 갈지 정해지지 않았다(docs/36 §3).
 */
export async function recordVerdict(formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  if (!key || !STATUSES.has(status)) return;

  if (status === "ok" && formData.get("clear")) {
    await saveVerdict(key, null);
    revalidatePath(PATH);
    return;
  }
  const verdict: Verdict = { status: status as Verdict["status"], at: new Date().toISOString() };
  const head = String(formData.get("head") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  if (status === "head" && head) verdict.head = head;
  if (note) verdict.note = note;
  await saveVerdict(key, verdict);
  revalidatePath(PATH);
}

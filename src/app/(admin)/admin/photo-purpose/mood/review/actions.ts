"use server";

import { revalidatePath } from "next/cache";
import { clearVerdict, saveNote, saveVerdict } from "@/lib/mood-review-data";
import type { Verdict } from "@/lib/mood-review";

const PATH = "/admin/photo-purpose/mood/review";
const STATUSES = new Set(["ok", "head", "split", "drop"]);

/**
 * 판정을 파일에 적는다. DB에는 쓰지 않는다 — 이 화면은 임시 검수용이고,
 * 무드 어휘는 아직 어떤 테이블로 갈지 정해지지 않았다(docs/40 §3).
 */
export async function recordVerdict(formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  if (!key || !STATUSES.has(status)) return;

  if (formData.get("clear")) {
    await clearVerdict(key);
    revalidatePath(PATH);
    return;
  }
  const verdict: Verdict = { status: status as Verdict["status"], at: new Date().toISOString() };
  const head = String(formData.get("head") ?? "").trim();
  if (status === "head" && head) verdict.head = head;
  // 피드백 칸에 쳐 두고 저장을 안 눌렀어도 판정과 함께 넘어간다.
  if (formData.has("note")) verdict.note = String(formData.get("note") ?? "").trim().slice(0, 300);
  await saveVerdict(key, verdict);
  revalidatePath(PATH);
}

/** 피드백만 저장한다. 판정 상태는 그대로 둔다 — 아직 안 본 묶음에도 남길 수 있다. */
export async function recordNote(formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  if (!key) return;
  await saveNote(key, String(formData.get("note") ?? "").trim().slice(0, 300));
  revalidatePath(PATH);
}

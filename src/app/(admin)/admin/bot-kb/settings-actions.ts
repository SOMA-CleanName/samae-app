"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type SaveSettingsState = { ok: boolean; error: string | null };

const MAX_POLICY = 4000;
const MAX_TONE = 300;
const MAX_MSG = 1000;
const MAX_NAME = 40;

// 어드민에서 편집 가능한 고정 메시지 — 폼 필드명 → DB 컬럼
const MESSAGE_FIELDS = [
  ["botName", "bot_name", MAX_NAME],
  ["msgGreeting", "msg_greeting", MAX_MSG],
  ["msgHandoff", "msg_handoff", MAX_MSG],
  ["msgNoAnswer", "msg_no_answer", MAX_MSG],
  ["msgError", "msg_error", MAX_MSG],
] as const;

// bot_settings 는 RLS 가 is_admin 이지만 서버액션은 admin 클라이언트로 쓰므로
// 역할 검사를 여기서 먼저 한다 (KB 액션과 같은 원칙).
async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

/**
 * 봇 전역 정책 저장.
 * 정책 문구가 바뀌면 policy_version 을 올린다 — 어떤 버전 정책으로 답했는지 나중에 따질 수 있게.
 */
export async function saveBotSettings(
  _prev: SaveSettingsState,
  formData: FormData
): Promise<SaveSettingsState> {
  await assertAdmin();

  const policyText = String(formData.get("policyText") ?? "").trim();
  const defaultTone = String(formData.get("defaultTone") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const enabled = formData.get("enabled") === "on";

  if (policyText.length > MAX_POLICY) {
    return { ok: false, error: `정책은 ${MAX_POLICY}자 이하여야 해요 (현재 ${policyText.length}자).` };
  }
  if (defaultTone.length > MAX_TONE) {
    return { ok: false, error: `기본 말투는 ${MAX_TONE}자 이하여야 해요.` };
  }

  // 고정 메시지 — 비우면 코드 기본 문구로 폴백하므로 빈 값도 정상 저장이다
  const messages: Record<string, string> = {};
  for (const [field, column, max] of MESSAGE_FIELDS) {
    const v = String(formData.get(field) ?? "").trim();
    if (v.length > max) return { ok: false, error: `메시지가 ${max}자를 넘었어요 (${field}).` };
    messages[column] = v;
  }

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("bot_settings")
    .select("policy_text, policy_version")
    .eq("id", true)
    .maybeSingle();

  const changed = (current?.policy_text ?? "") !== policyText;
  const version = (current?.policy_version ?? 1) + (changed ? 1 : 0);

  const { error } = await admin.from("bot_settings").upsert(
    {
      id: true,
      enabled,
      policy_text: policyText,
      policy_version: version,
      default_tone: defaultTone,
      model,
      ...messages,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/bot-kb");
  return { ok: true, error: null };
}

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseKbJson } from "@/lib/bot-kb-db";
import { getPhotographerKb } from "@/lib/bot-kb-data";

// 이번 단계 정책: KB 는 운영진만 쓴다 (테이블 RLS 도 write=is_admin).
// 서버액션은 RLS 를 우회하는 admin 클라이언트를 쓰므로 역할 검사를 여기서 먼저 한다.
async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

export type SaveKbState = {
  ok: boolean;
  errors: string[];
  /** 저장 성공 시 카드 수 — 편집기가 "N장 저장됨" 을 띄운다 */
  count?: number;
};

/**
 * KB 저장 (useActionState 시그니처).
 * 검증에 하나라도 걸리면 **아무것도 저장하지 않는다** — 나쁜 카드만 조용히 빠지면
 * 운영은 저장된 줄 알고, 봇은 그 사실을 모른 채 답을 못 하게 된다.
 */
export async function saveBotKb(_prev: SaveKbState, formData: FormData): Promise<SaveKbState> {
  await assertAdmin();

  const photographerId = String(formData.get("photographerId") ?? "").trim();
  if (!photographerId) return { ok: false, errors: ["작가가 지정되지 않았습니다."] };

  const { cards, errors } = parseKbJson(String(formData.get("cards") ?? ""));
  if (errors.length > 0) return { ok: false, errors };

  const admin = createAdminClient();
  const { error } = await admin.from("photographer_bot_kb").upsert(
    {
      photographer_id: photographerId,
      cards,
      greeting: String(formData.get("greeting") ?? "").trim(),
      enabled: formData.get("enabled") === "on",
      note: String(formData.get("note") ?? "").trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "photographer_id" }
  );
  if (error) return { ok: false, errors: [error.message] };

  revalidatePath("/admin/bot-kb");
  return { ok: true, errors: [], count: cards.length };
}

/**
 * 파일 데모(bot-kb-data.ts)의 카드를 그대로 JSON 텍스트로 뽑아준다.
 * 하드코딩 KB 를 DB 로 옮길 때 운영이 다시 타이핑하지 않게 하려는 용도 — 저장은 하지 않는다.
 */
export async function seedFromDemo(photographerId: string): Promise<{ text: string; error?: string }> {
  await assertAdmin();
  const kb = getPhotographerKb(photographerId, "");
  if (!kb || kb.cards.length === 0) {
    return { text: "", error: "이 작가에게는 파일 데모 카드가 없습니다." };
  }
  return { text: JSON.stringify(kb.cards, null, 2) };
}

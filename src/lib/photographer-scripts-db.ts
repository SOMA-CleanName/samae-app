// 작가 문의대본 — DB(photographer_bot_scripts) 우선 조회 (서버 전용).
//
// C2: 스튜디오 편집 UI에서 작가가 직접 tone/customQuestions 를 저장하고,
// 봇 서버(/api/inquiry-bot)는 여기서 읽는다. DB에 행이 없거나 비어 있으면
// 파일 기반 폴백(photographer-scripts.ts — 데모 2개 + 기본 대본)으로 내려간다.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_SCRIPT,
  MAX_SCRIPT_QUESTIONS,
  getPhotographerScript,
  type PhotographerScript,
} from "./photographer-scripts";

/** DB 행 → 대본 정규화 — 질문은 문자열만·최대 3개, 톤이 비면 기본 톤 */
export function normalizeScriptRow(
  photographerId: string,
  row: { tone?: unknown; custom_questions?: unknown } | null
): PhotographerScript | null {
  if (!row) return null;
  const tone = typeof row.tone === "string" ? row.tone.trim() : "";
  const questions = Array.isArray(row.custom_questions)
    ? row.custom_questions
        .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        .map((q) => q.trim().slice(0, 200))
        .slice(0, MAX_SCRIPT_QUESTIONS)
    : [];
  if (!tone && questions.length === 0) return null; // 빈 대본 — 폴백 사용
  return {
    id: `db:${photographerId}`,
    tone: tone || DEFAULT_SCRIPT.tone,
    customQuestions: questions,
  };
}

/** 작가 문의대본 조회 — DB 커스텀 → 파일 데모 → 기본 대본 순 */
export async function fetchPhotographerScript(photographerId: string): Promise<PhotographerScript> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("photographer_bot_scripts")
      .select("tone, custom_questions")
      .eq("photographer_id", photographerId)
      .maybeSingle();
    const fromDb = normalizeScriptRow(photographerId, data);
    if (fromDb) return fromDb;
  } catch {
    /* DB 실패 — 파일 폴백으로 (봇이 멈추지 않게) */
  }
  return getPhotographerScript(photographerId);
}

/**
 * 작가가 **직접 정한** 말투만 (미설정이면 빈 문자열).
 *
 * fetchPhotographerScript 는 기본 대본까지 폴백해서 tone 이 절대 비지 않는다.
 * 그러면 어드민의 전역 기본 말투가 영영 가려지므로, 상담봇은 이 함수를 쓴다.
 */
export async function fetchPhotographerTone(photographerId: string): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("photographer_bot_scripts")
      .select("tone")
      .eq("photographer_id", photographerId)
      .maybeSingle();
    return typeof data?.tone === "string" ? data.tone.trim().slice(0, 300) : "";
  } catch {
    return "";
  }
}

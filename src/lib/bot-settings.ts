import "server-only";

// 봇 전역 정책 — 운영이 배포 없이 만지는 것들 (bot_settings 싱글턴).
//
// 코드 상수(platform-policy.ts)는 폴백으로 남긴다. DB 조회가 실패해도 봇이 멈추면 안 되고,
// 마이그레이션 이전 환경에서도 그대로 돌아야 한다 — photographer-scripts-db 와 같은 원칙.

import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_POLICY, PLATFORM_POLICY_VERSION } from "./platform-policy";
import { DEFAULT_MESSAGES, PHOTOGRAPHER_TOKEN, renderBotMessage } from "./bot-messages";

// 기본 문구·치환은 클라이언트(어드민 편집기)도 봐야 해서 bot-messages.ts 에 있다.
// 서버 쪽 호출부 편의를 위해 여기서 다시 내보낸다.
export { DEFAULT_MESSAGES, PHOTOGRAPHER_TOKEN, renderBotMessage };

/** 코드 기본 모델 — env 로 덮어쓸 수 있고, DB 설정이 그보다 우선한다 */
const CODE_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

export type BotSettings = {
  /** 전역 킬스위치 — false 면 봇은 답하지 않고 작가에게 넘기기만 한다 */
  enabled: boolean;
  /** 프롬프트에 주입되는 사매 공통 정책 (비었으면 코드 상수) */
  policy: string;
  policyVersion: number;
  /** 작가가 말투를 정하지 않았을 때의 기본 말투 */
  defaultTone: string;
  model: string;
  /** 고정 메시지 템플릿 ({작가} 토큰 포함 가능). 비어 있으면 코드 기본 문구가 들어와 있다 */
  messages: {
    botName: string;
    greeting: string;
    handoff: string;
    noAnswer: string;
    error: string;
  };
};

export const FALLBACK_SETTINGS: BotSettings = {
  enabled: true,
  policy: PLATFORM_POLICY,
  policyVersion: PLATFORM_POLICY_VERSION,
  defaultTone: "",
  model: CODE_MODEL,
  messages: { ...DEFAULT_MESSAGES },
};

type Row = {
  enabled: boolean | null;
  policy_text: string | null;
  policy_version: number | null;
  default_tone: string | null;
  model: string | null;
  bot_name?: string | null;
  msg_greeting?: string | null;
  msg_handoff?: string | null;
  msg_no_answer?: string | null;
  msg_error?: string | null;
};

const pick = (v: string | null | undefined, fallback: string) => (v ?? "").trim() || fallback;

/** DB 행 → 설정. 빈 문자열은 "설정 안 함"이라 폴백으로 내려간다 (순수 함수 — 테스트 가능) */
export function normalizeSettings(row: Row | null): BotSettings {
  if (!row) return FALLBACK_SETTINGS;
  const policy = (row.policy_text ?? "").trim();
  const model = (row.model ?? "").trim();
  return {
    enabled: row.enabled !== false,
    policy: policy || PLATFORM_POLICY,
    // 문구와 버전은 같이 다녀야 한다 — DB 문구가 비어 코드 상수를 쓰는데 버전만 옛 숫자면
    // 어드민이 "구버전 정책이 돌고 있다" 고 잘못 읽는다.
    policyVersion: policy ? row.policy_version ?? PLATFORM_POLICY_VERSION : PLATFORM_POLICY_VERSION,
    defaultTone: (row.default_tone ?? "").trim(),
    model: model || CODE_MODEL,
    messages: {
      botName: pick(row.bot_name, DEFAULT_MESSAGES.botName),
      greeting: pick(row.msg_greeting, DEFAULT_MESSAGES.greeting),
      handoff: pick(row.msg_handoff, DEFAULT_MESSAGES.handoff),
      noAnswer: pick(row.msg_no_answer, DEFAULT_MESSAGES.noAnswer),
      error: pick(row.msg_error, DEFAULT_MESSAGES.error),
    },
  };
}

const COLS =
  "enabled, policy_text, policy_version, default_tone, model, bot_name, msg_greeting, msg_handoff, msg_no_answer, msg_error";

/** 봇 서버용 — service_role 로 읽는다. 실패하면 코드 폴백 (봇이 멈추지 않게) */
export async function fetchBotSettings(): Promise<BotSettings> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("bot_settings").select(COLS).eq("id", true).maybeSingle();
    return normalizeSettings((data ?? null) as Row | null);
  } catch {
    return FALLBACK_SETTINGS;
  }
}

/** 어드민 편집기용 — 저장된 원본 그대로 (빈 값이면 "미설정"으로 보여줘야 한다) */
export async function fetchBotSettingsRaw(): Promise<{
  enabled: boolean;
  policyText: string;
  policyVersion: number;
  defaultTone: string;
  model: string;
  botName: string;
  msgGreeting: string;
  msgHandoff: string;
  msgNoAnswer: string;
  msgError: string;
  updatedAt: string | null;
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bot_settings")
    .select(`${COLS}, updated_at`)
    .eq("id", true)
    .maybeSingle();
  const r = data as (Row & { updated_at: string }) | null;
  return {
    enabled: r?.enabled !== false,
    policyText: r?.policy_text ?? "",
    policyVersion: r?.policy_version ?? PLATFORM_POLICY_VERSION,
    defaultTone: r?.default_tone ?? "",
    model: r?.model ?? "",
    botName: r?.bot_name ?? "",
    msgGreeting: r?.msg_greeting ?? "",
    msgHandoff: r?.msg_handoff ?? "",
    msgNoAnswer: r?.msg_no_answer ?? "",
    msgError: r?.msg_error ?? "",
    updatedAt: r?.updated_at ?? null,
  };
}

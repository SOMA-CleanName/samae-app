// 작가 KB — DB(photographer_bot_kb) 우선 조회 (서버 전용).
//
// 이번 단계 정책: **운영진이 어드민에서 JSON 을 직접 넣는다.**
// 작가가 준 안내 이미지·정책 문서를 운영이 카드로 옮겨 적고, 그 카드만이 봇의 근거다.
// DB 행이 없거나 비어 있으면 파일 데모(bot-kb-data.ts)로 폴백 — 봇이 멈추지 않게.

import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_CARD_BODY, MAX_CARDS, type KbCard, type PhotographerKb } from "./bot-kb";
import { fetchBotSettings, renderBotMessage } from "./bot-settings";
import { getPhotographerKb as getFileKb } from "./bot-kb-data";

// 상한은 bot-kb.ts 에 있다 (어드민 편집기가 클라이언트에서 같은 값을 써야 해서).
export { MAX_CARD_BODY, MAX_CARDS };

const SOURCES = new Set(["작가 답변", "운영 확인"]);

/**
 * 운영이 붙여넣은 JSON → KbCard[] 정규화.
 * id 는 인용 키라서 반드시 있어야 하고, 중복되면 뒤엣것을 버린다(먼저 쓴 카드가 이긴다).
 * 순수 함수 — 어드민 폼 검증과 봇 조회가 같은 규칙을 쓴다.
 */
export function normalizeKbCards(raw: unknown): { cards: KbCard[]; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(raw)) return { cards: [], errors: ["최상위가 배열(JSON array)이어야 합니다."] };

  const cards: KbCard[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${i + 1}번째: 객체가 아닙니다.`);
      return;
    }
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const topic = typeof r.topic === "string" ? r.topic.trim() : "";
    const body = typeof r.body === "string" ? r.body.trim() : "";
    if (!id) return void errors.push(`${i + 1}번째: id 가 없습니다.`);
    if (!topic) return void errors.push(`${i + 1}번째(${id}): topic 이 없습니다.`);
    if (!body) return void errors.push(`${i + 1}번째(${id}): body 가 없습니다.`);
    if (seen.has(id)) return void errors.push(`${i + 1}번째: id "${id}" 가 중복입니다.`);
    if (body.length > MAX_CARD_BODY) {
      return void errors.push(`${i + 1}번째(${id}): body 가 ${MAX_CARD_BODY}자를 넘습니다.`);
    }
    seen.add(id);
    const source = typeof r.source === "string" && SOURCES.has(r.source) ? (r.source as KbCard["source"]) : undefined;
    const confirmedAt = typeof r.confirmedAt === "string" && r.confirmedAt.trim() ? r.confirmedAt.trim() : undefined;
    cards.push({ id, topic, body, ...(source ? { source } : {}), ...(confirmedAt ? { confirmedAt } : {}) });
  });

  if (cards.length > MAX_CARDS) {
    errors.push(`카드는 최대 ${MAX_CARDS}장까지입니다 (현재 ${cards.length}장).`);
    return { cards: cards.slice(0, MAX_CARDS), errors };
  }
  return { cards, errors };
}

/** 문자열 JSON → 정규화. 어드민 폼이 쓴다. */
export function parseKbJson(text: string): { cards: KbCard[]; errors: string[] } {
  const t = text.trim();
  if (!t) return { cards: [], errors: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(t);
  } catch (e) {
    return { cards: [], errors: [`JSON 파싱 실패: ${e instanceof Error ? e.message : "형식 오류"}`] };
  }
  return normalizeKbCards(raw);
}

/**
 * 이 작가의 KB — DB → 파일 데모 순. 없으면 null (봇은 기존 수집 모드로 동작).
 * enabled=false 면 KB 자체를 끈 것으로 보고 파일 폴백도 쓰지 않는다.
 */
export async function fetchPhotographerKb(
  photographerId: string,
  displayName: string
): Promise<PhotographerKb | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("photographer_bot_kb")
      .select("cards, greeting, enabled")
      .eq("photographer_id", photographerId)
      .maybeSingle();
    if (data) {
      if (data.enabled === false) return null;
      const { cards } = normalizeKbCards(data.cards);
      if (cards.length > 0) {
        return { photographerId, displayName, cards };
      }
    }
  } catch {
    /* DB 실패 — 파일 폴백으로 */
  }
  return getFileKb(photographerId, displayName);
}

/** 이 작가가 KB 를 갖고 있는가 — 방을 상담(Q&A) 모드로 열지 판정할 때만 쓴다(카드 본문 불필요) */
export async function photographerHasKb(photographerId: string): Promise<boolean> {
  const kb = await fetchPhotographerKb(photographerId, "");
  return !!kb && kb.cards.length > 0;
}

/**
 * 이 방에서 쓸 첫 인사말 — **작가별 인사말 > 전역 인사말 > 코드 기본** 순.
 *
 * photographer_bot_kb.greeting 은 여태 저장만 되고 아무 데서도 읽히지 않았다(죽은 필드).
 * 어드민에 입력칸이 있는데 효과가 없으면 운영이 헛일을 하므로 여기서 잇는다.
 */
export async function resolveGreeting(photographerId: string, displayName: string): Promise<string> {
  const [settings, own] = await Promise.all([
    fetchBotSettings(),
    (async () => {
      try {
        const admin = createAdminClient();
        const { data } = await admin
          .from("photographer_bot_kb")
          .select("greeting")
          .eq("photographer_id", photographerId)
          .maybeSingle();
        return typeof data?.greeting === "string" ? data.greeting.trim() : "";
      } catch {
        return "";
      }
    })(),
  ]);
  return renderBotMessage(own || settings.messages.greeting, displayName);
}

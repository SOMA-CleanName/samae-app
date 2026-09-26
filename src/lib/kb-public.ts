import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeKbCards } from "@/lib/bot-kb-db";
import { groupKbIntoSections, type KbSection } from "@/lib/kb-sections";

/**
 * 작가 공개 지면에 실을 안내 글.
 *
 * 우리는 작가 답변(KB 카드)을 **이미지로 구워** 채팅에서 보여준다(guide-bake). 그런데
 * 검색엔진도 AI 도 픽셀 안의 글자를 못 읽는다. 작가 3명치 7,432자가 지면 어디에도
 * 글로는 없었다(실측 2026-09-26) — 가격·구성·보정·납품처럼 고객이 정확히 검색하는
 * 내용이 전부 거기 있는데도.
 *
 * OCR 이 필요 없다. **원본이 DB 에 구조화된 채로 있다.** 이미지를 만든 그 카드를
 * 그대로 글로도 내보낸다.
 *
 * ⚠️ **공개 여부는 안내 이미지를 따른다.** 카드는 상담봇용으로 받은 것이고, 공개 지면에
 *    싣는 건 다른 일이다. 작가가 안내 이미지를 공개해 둔 경우에만 — 즉 "이 내용을
 *    고객에게 보여도 된다" 고 이미 정한 경우에만 — 글도 싣는다.
 */
export async function fetchPublicKbSections(photographerId: string): Promise<KbSection[]> {
  if (!photographerId) return [];
  const admin = createAdminClient();

  // 공개된 **우리 시트**가 있는가. 작가가 직접 올린 이미지는 KB 와 무관하므로 세지 않는다.
  const { data: sheets } = await admin
    .from("photographer_guide_images")
    .select("image_url")
    .eq("photographer_id", photographerId)
    .eq("published", true);
  const hasPublishedSheet = (sheets ?? []).some((s: { image_url: string }) =>
    /\/sheet\//.test(s.image_url)
  );
  if (!hasPublishedSheet) return [];

  const { data: kb } = await admin
    .from("photographer_bot_kb")
    .select("cards")
    .eq("photographer_id", photographerId)
    .maybeSingle();
  if (!kb) return [];

  // 저장 당시와 검증 규칙이 달라졌을 수 있다 — 깨진 카드는 버리고 나머지는 싣는다
  const { cards } = normalizeKbCards(kb.cards);
  return groupKbIntoSections(cards);
}

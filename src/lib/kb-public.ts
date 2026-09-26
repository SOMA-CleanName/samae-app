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
 * ⚠️ **공개 여부는 안내 이미지를 따른다.** 그 이미지는 채팅뿐 아니라 `/photos/[id]`
 *    (사이트맵에 들어가는 공개 지면)에도 떠 있다 — 즉 이 내용은 **이미 공개돼 있고**,
 *    여기서 하는 일은 같은 내용을 기계도 읽을 수 있는 형태로 한 번 더 내는 것뿐이다.
 *    그래서 이미지를 켜는 것과 같은 `published` 플래그를 그대로 따른다.
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

"use server";

import { getCurrentUser } from "@/lib/auth";
import { debugSearchPhotos, type DebugSearchResponse } from "@/lib/discovery";
import { searchPhotos } from "@/lib/siglip-text-search";
import { interpretationFrom, type SearchInterpretation } from "@/lib/search-interpretation";

/** 실제 검색 길(홈 검색과 같은 searchPhotos)로 해석한 결과 */
export type LiveSearchPreview = {
  interpretation: SearchInterpretation;
  matches: number;
  related: number;
  /** 앞쪽 사진 몇 장 — 어떤 결이 나오는지 눈으로 */
  sample: { id: string; url: string }[];
  /** 연관 검색어 이름 */
  suggestions: string[];
};

export type DebugState = {
  ran: boolean;
  q: string;
  data: DebugSearchResponse | null;
  live?: LiveSearchPreview | null;
  /** 실제 검색 해석이 실패한 이유(맥미니 검색어 분리 서버에 못 닿는 등) — 태그 채점은 그대로 보여준다 */
  liveError?: string;
  error?: string;
};

// 어드민 검색 시뮬레이터 — ① 실제 검색 길로 해석(어느 목적 · 무드 가족으로 가나) ② 태그 점수 분해(예전 채점).
export async function runSearchDebug(_prev: DebugState, formData: FormData): Promise<DebugState> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return { ran: false, q: "", data: null, error: "운영자 권한이 필요합니다." };
  }
  const q = String(formData.get("q") ?? "").trim();
  if (!q) return { ran: false, q: "", data: null };

  const [data, live] = await Promise.all([
    debugSearchPhotos(q),
    searchPhotos(q, 60).then(
      (result) => ({
        ok: true as const,
        preview: {
          interpretation: interpretationFrom(result),
          matches: result.matches.length,
          related: result.related.length,
          sample: result.matches.slice(0, 8).map((p) => ({ id: p.id, url: p.thumb_url ?? p.src_url })),
          suggestions: (result.suggestions ?? []).map((s) => s.label),
        },
      }),
      (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) })
    ),
  ]);
  return live.ok
    ? { ran: true, q, data, live: live.preview }
    : { ran: true, q, data, live: null, liveError: live.error };
}

import "server-only";

import { createClient } from "@/lib/supabase/server";

// 작가 안내 이미지 — 작가가 촬영 때 고객에게 주는 안내(준비물·진행·보정 등)를 이미지로 올린 것.
// 사진 상세의 "이 사진을 찍은 패키지 정보" 아래에 세로로 노출되고, 탭하면 스와이프 뷰어가 열린다.
// 챗봇 KB(photographer_bot_kb)와는 별개 자산 — 이미지는 사람이 보고, KB 는 봇이 읽는다.
export type GuideImage = {
  id: string;
  image_url: string;
  thumb_url: string | null;
  width: number | null;
  height: number | null;
  caption: string;
  sort_order: number;
};

const COLS = "id, image_url, thumb_url, width, height, caption, sort_order";

/** 공개 안내 이미지 (비로그인 포함). 실패해도 섹션만 빠지고 페이지는 산다. */
export async function fetchGuideImages(photographerId: string): Promise<GuideImage[]> {
  if (!photographerId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("photographer_guide_images")
    .select(COLS)
    .eq("photographer_id", photographerId)
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as GuideImage[];
}

/** 스튜디오 편집용 — 비공개 포함 전체 (RLS: 작가 본인) */
export async function listMyGuideImages(photographerId: string): Promise<(GuideImage & { published: boolean })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photographer_guide_images")
    .select(`${COLS}, published`)
    .eq("photographer_id", photographerId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as (GuideImage & { published: boolean })[];
}

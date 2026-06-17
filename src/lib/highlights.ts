import "server-only";

import { createClient } from "@/lib/supabase/server";

export type HighlightItem = {
  id: string;
  photo_id: string | null; // 포트폴리오 사진 참조(직접 업로드 항목이면 null)
  image_url: string | null; // 직접 업로드(9:16 크롭) 이미지 URL
  src_url: string;
  thumb_url: string | null;
  sort_order: number;
};

export type Highlight = {
  id: string;
  title: string;
  cover_url: string | null;
  cover_photo_id: string | null;
  sort_order: number;
  items: HighlightItem[];
};

// Supabase 조인 응답(부분) 타입
type RawItem = {
  id: string;
  photo_id: string | null;
  image_url: string | null;
  sort_order: number;
  photo: { src_url: string; thumb_url: string | null; visibility: string } | null;
};
type RawHighlight = {
  id: string;
  title: string;
  cover_url: string | null;
  cover_photo_id: string | null;
  sort_order: number;
  items: RawItem[] | null;
};

const SELECT =
  "id, title, cover_url, cover_photo_id, sort_order, " +
  "items:highlight_items(id, photo_id, image_url, sort_order, photo:photos(src_url, thumb_url, visibility))";

function shape(rows: RawHighlight[], onlyPublished: boolean): Highlight[] {
  const out: Highlight[] = [];
  for (const h of rows) {
    const items = (h.items ?? [])
      .map((it) => {
        // 직접 업로드 항목(image_url)은 항상 공개, 포트폴리오 항목은 사진의 visibility 따름
        const src = it.image_url ?? it.photo?.src_url ?? null;
        const published = !!it.image_url || it.photo?.visibility === "published";
        return {
          id: it.id,
          photo_id: it.photo_id,
          image_url: it.image_url ?? null,
          src_url: src,
          thumb_url: it.image_url ?? it.photo?.thumb_url ?? null,
          sort_order: it.sort_order,
          published,
        };
      })
      .filter((it) => it.src_url !== null && (!onlyPublished || it.published))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ published, ...rest }) => rest as HighlightItem);
    if (onlyPublished && items.length === 0) continue; // 공개 항목 없으면 숨김
    out.push({
      id: h.id,
      title: h.title,
      cover_url: h.cover_url,
      cover_photo_id: h.cover_photo_id,
      sort_order: h.sort_order,
      items,
    });
  }
  return out;
}

// 공개 프로필용 — 공개 사진 항목만, 빈 하이라이트는 제외 (RLS: highlights_select)
export async function fetchPhotographerHighlights(photographerId: string): Promise<Highlight[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("highlights")
    .select(SELECT)
    .eq("photographer_id", photographerId)
    .order("sort_order", { ascending: true });
  return shape((data ?? []) as unknown as RawHighlight[], true);
}

// 스튜디오 관리용 — 모든 하이라이트·항목(비공개 포함). 호출자가 소유 작가임을 보장.
export async function listMyHighlights(photographerId: string): Promise<Highlight[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("highlights")
    .select(SELECT)
    .eq("photographer_id", photographerId)
    .order("sort_order", { ascending: true });
  return shape((data ?? []) as unknown as RawHighlight[], false);
}

// 하이라이트 커버 이미지 URL 결정 — cover_url > 커버 사진 > 첫 항목
export function highlightCover(h: Highlight): string | null {
  if (h.cover_url) return h.cover_url;
  if (h.cover_photo_id) {
    const found = h.items.find((it) => it.photo_id === h.cover_photo_id);
    if (found) return found.thumb_url ?? found.src_url;
  }
  const first = h.items[0];
  return first ? first.thumb_url ?? first.src_url : null;
}

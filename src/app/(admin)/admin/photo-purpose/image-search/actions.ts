"use server";

import { getCurrentUser } from "@/lib/auth";
import { parseImageDataUrl } from "@/lib/image-search-core";
import { embedImages } from "@/lib/persona/embed";
import { SIGLIP_SEARCH_MAX_RESULTS } from "@/lib/siglip-text-search-core";
import { createAdminClient } from "@/lib/supabase/admin";

/** 사진 한 장의 검색 결과 한 줄 — 점수와 함께 분류(목적·무드)도 같이 본다. */
export type ImageProbeRow = {
  id: string;
  thumb_url: string | null;
  src_url: string;
  /** 코사인 거리 (0=같은 사진). 유사도 = 1 - distance */
  distance: number;
  photographer: string | null;
  purposes: string[];
  moodTags: string[];
};

export type ImageProbeResult =
  | { ok: true; rows: ImageProbeRow[] }
  | { ok: false; error: string };

/**
 * 올린 사진과 가까운 사진을 **검색 화면과 같은 경로**로 찾는다(SigLIP → kNN 300장).
 * 순서를 흩뜨리지 않고 점수 그대로 보여주는 게 이 화면의 목적이다.
 *
 * 비공개·피드에서 내린 사진은 나오지 않는다 — 검색과 같은 RPC(0128)를 쓰기 때문이다.
 */
export async function probeByImage(dataUrl: string): Promise<ImageProbeResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false, error: "운영자 권한이 필요합니다." };

  const image = parseImageDataUrl(dataUrl);
  if (!image) return { ok: false, error: "사진을 읽지 못했습니다. JPG·PNG 로 올려주세요." };

  const embedded = await embedImages([image.base64], { timeoutMs: 8_000 });
  const vector = embedded?.vectors[0];
  if (!vector) return { ok: false, error: "임베딩 서버(8077)가 켜져 있는지 확인하세요." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("similar_photos_by_vector", {
    p_embedding: JSON.stringify(vector),
    p_limit: SIGLIP_SEARCH_MAX_RESULTS,
  });
  if (error) return { ok: false, error: `유사 사진 조회 실패: ${error.message}` };

  const nearest = (data ?? []) as Array<{ id: string; distance: number }>;
  if (!nearest.length) return { ok: true, rows: [] };

  // RPC 는 점수만 준다 — 분류를 같이 보려면 사진 행을 따로 읽는다(순서는 점수로 되돌린다)
  const { data: photos, error: photoError } = await admin
    .from("photos")
    .select("id, thumb_url, src_url, mood_tags, admin_purposes, photographer:photographers!photos_photographer_id_fkey(display_name)")
    .in("id", nearest.map((row) => row.id));
  if (photoError) return { ok: false, error: `사진 조회 실패: ${photoError.message}` };

  const byId = new Map(
    ((photos ?? []) as unknown as Array<{
      id: string;
      thumb_url: string | null;
      src_url: string;
      mood_tags: string[] | null;
      admin_purposes: string[] | null;
      photographer: { display_name: string | null } | null;
    }>).map((photo) => [photo.id, photo]),
  );

  return {
    ok: true,
    rows: nearest.flatMap((row) => {
      const photo = byId.get(row.id);
      if (!photo) return [];
      return [{
        id: photo.id,
        thumb_url: photo.thumb_url,
        src_url: photo.src_url,
        distance: row.distance,
        photographer: photo.photographer?.display_name ?? null,
        purposes: photo.admin_purposes ?? [],
        moodTags: photo.mood_tags ?? [],
      }];
    }),
  };
}

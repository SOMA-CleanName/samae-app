import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { listAllSpots, type Spot } from "@/lib/spots-db";
import { isSpecificLocation, matchSpotPhotoIds } from "@/lib/spots";
import { planAutoSync, type ExistingLink } from "@/lib/spot-photo-sync";
import { deriveRegion } from "@/lib/photo-region";

// 촬영 장소 ↔ 사진 연결(spot_photos, 0145) — 계산과 어드민 조회.
//
// 공개 지면이 읽는 쪽은 lib/spots(linkedPhotosBySpot)에 있다. 여기는 쓰는 쪽과 운영자가 보는 쪽이다.

/**
 * 자동 연결을 다시 계산한다 — 매일 크론(09:00)과 어드민 「다시 계산」이 부른다.
 *
 * 비공개 장소도 계산한다 — 운영자가 켜기 전에 어떤 사진이 붙을지 어드민에서 보고 판단한다.
 * 운영자가 넣은 것(manual) · 뺀 것(excluded)은 지킨다(lib/spot-photo-sync).
 * 키워드 매칭은 DB `location_text ilike` 라 무겁지만 하루 한 번, 장소 수만큼이다.
 */
export async function recomputeSpotPhotos(): Promise<{ ok: boolean; [k: string]: unknown }> {
  const admin = createAdminClient();
  const spots = await listAllSpots();
  const now = new Date().toISOString();
  let linked = 0;
  let removed = 0;

  for (const spot of spots) {
    const matchedIds = await matchSpotPhotoIds(spot);
    const { data: existingRows, error } = await admin
      .from("spot_photos")
      .select("photo_id, source, excluded")
      .eq("spot_id", spot.id);
    // 표가 없으면(0145 전) 여기서 멈춘다 — 장소마다 같은 에러를 반복할 이유가 없다
    if (error) return { ok: false, error: error.message, spot: spot.slug };

    const existing: ExistingLink[] = (existingRows ?? []).map((r) => ({
      photoId: r.photo_id as string,
      source: r.source as ExistingLink["source"],
      excluded: r.excluded as boolean,
    }));
    const plan = planAutoSync(existing, matchedIds);

    if (plan.upsert.length > 0) {
      // updated_at 을 이번 계산 시각으로 — 어드민의 「마지막 계산」이 이걸 본다
      const { error: upsertError } = await admin.from("spot_photos").upsert(
        plan.upsert.map((u) => ({
          spot_id: spot.id,
          photo_id: u.photoId,
          source: "auto",
          excluded: u.excluded,
          sort: u.sort,
          updated_at: now,
        })),
        { onConflict: "spot_id,photo_id" }
      );
      if (upsertError) return { ok: false, error: upsertError.message, spot: spot.slug };
    }
    // .in() 은 URL 길이에 걸리므로 100개씩
    for (let i = 0; i < plan.remove.length; i += 100) {
      const { error: deleteError } = await admin
        .from("spot_photos")
        .delete()
        .eq("spot_id", spot.id)
        .eq("source", "auto")
        .in("photo_id", plan.remove.slice(i, i + 100));
      if (deleteError) return { ok: false, error: deleteError.message, spot: spot.slug };
    }
    linked += plan.upsert.length;
    removed += plan.remove.length;
  }

  const regionsFilled = await backfillPhotoRegions(new Map(spots.map((s) => [s.id, s.city])));
  return { ok: true, spots: spots.length, linked, removed, regionsFilled };
}

/**
 * 비어 있는 사진 지역(photos.region)을 채운다 — 장소 메모 + 붙은 촬영 장소의 시·도로(lib/photo-region).
 *
 * 「서울」 처럼 장소라기엔 넓은 말만 적힌 사진도 지역으로는 남긴다(2026-10-06 결정).
 * **이미 값이 있는 사진은 건드리지 않는다.** 장소 연결 계산 뒤에 돈다 — 연결된 장소의 시·도를 쓰려고.
 */
async function backfillPhotoRegions(cityBySpot: Map<string, string>): Promise<number> {
  const admin = createAdminClient();

  const photos: Array<{ id: string; location_text: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("photos")
      .select("id, location_text")
      .is("region", null)
      .order("id")
      .range(from, from + 999);
    if (error) return 0;
    photos.push(...((data ?? []) as Array<{ id: string; location_text: string | null }>));
    if ((data ?? []).length < 1000) break;
  }
  if (photos.length === 0) return 0;

  const citiesByPhoto = new Map<string, string[]>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("spot_photos")
      .select("spot_id, photo_id")
      .eq("excluded", false)
      .order("photo_id")
      .range(from, from + 999);
    for (const r of data ?? []) {
      const city = cityBySpot.get(r.spot_id as string);
      if (!city) continue;
      const list = citiesByPhoto.get(r.photo_id as string) ?? [];
      list.push(city);
      citiesByPhoto.set(r.photo_id as string, list);
    }
    if ((data ?? []).length < 1000) break;
  }

  // 같은 지역끼리 묶어 한 번에 쓴다
  const idsByRegion = new Map<string, string[]>();
  for (const p of photos) {
    const region = deriveRegion(p.location_text, citiesByPhoto.get(p.id) ?? []);
    if (!region) continue;
    const ids = idsByRegion.get(region) ?? [];
    ids.push(p.id);
    idsByRegion.set(region, ids);
  }

  let filled = 0;
  for (const [region, ids] of idsByRegion) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      // 그사이 누가 채웠으면 덮지 않는다
      const { error } = await admin.from("photos").update({ region }).in("id", chunk).is("region", null);
      if (!error) filled += chunk.length;
    }
  }
  return filled;
}

// ── 어드민 조회 ───────────────────────────────────────────────────────

export type AdminSpotPhoto = {
  photoId: string;
  thumbUrl: string | null;
  srcUrl: string;
  locationText: string | null;
  photographerName: string | null;
  /** 공개 지면에 실제로 뜨는 사진인가 — 비공개 · 피드에서 내림 · 미승인 작가면 false */
  visible: boolean;
  /**
   * 장소 메모가 여러 곳을 나열한 사진인가(「경복궁, 창덕궁, 창경궁, 덕수궁」).
   * 자동 연결은 저장되지만 지면엔 안 뜬다 — 운영자가 「지면에 싣기」 하면 manual 이 된다(lib/spots).
   */
  listed: boolean;
  /** 이 사진이 붙은 장소들 */
  links: Array<{ spotId: string; source: "auto" | "manual"; excluded: boolean }>;
};

export type SpotLinkSummary = {
  spot: Spot;
  /** 지면에 실리는 수(뺀 것 제외, 사진 공개 여부는 보지 않은 값) */
  included: number;
  manual: number;
  excluded: number;
};

const PHOTO_COLS =
  "id, thumb_url, src_url, location_text, visibility, feed_hidden, photographer:photographers!photos_photographer_id_fkey(display_name, status)";

type PhotoRow = {
  id: string;
  thumb_url: string | null;
  src_url: string;
  location_text: string | null;
  visibility: string;
  feed_hidden: boolean;
  photographer: { display_name: string | null; status: string } | null;
};

type LinkRow = { spot_id: string; photo_id: string; source: "auto" | "manual"; excluded: boolean; sort: number };

/** 표가 없으면(0145 전) null */
export async function loadSpotLinkOverview(): Promise<{
  summaries: SpotLinkSummary[];
  lastComputedAt: string | null;
} | null> {
  const admin = createAdminClient();
  const links: LinkRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("spot_photos")
      .select("spot_id, photo_id, source, excluded, sort")
      .range(from, from + 999);
    if (error) return null;
    links.push(...((data ?? []) as LinkRow[]));
    if ((data ?? []).length < 1000) break;
  }
  const { data: last } = await admin
    .from("spot_photos")
    .select("updated_at")
    .eq("source", "auto")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const spots = await listAllSpots();
  const summaries = spots.map((spot) => {
    const mine = links.filter((l) => l.spot_id === spot.id);
    return {
      spot,
      included: mine.filter((l) => !l.excluded).length,
      manual: mine.filter((l) => l.source === "manual").length,
      excluded: mine.filter((l) => l.excluded).length,
    };
  });
  return { summaries, lastComputedAt: (last?.updated_at as string | undefined) ?? null };
}

function toAdminPhoto(p: PhotoRow, links: LinkRow[]): AdminSpotPhoto {
  return {
    photoId: p.id,
    thumbUrl: p.thumb_url,
    srcUrl: p.src_url,
    locationText: p.location_text,
    photographerName: p.photographer?.display_name ?? null,
    visible: p.visibility === "published" && !p.feed_hidden && p.photographer?.status === "approved",
    listed: !isSpecificLocation(p.location_text),
    links: links
      .filter((l) => l.photo_id === p.id)
      .map((l) => ({ spotId: l.spot_id, source: l.source, excluded: l.excluded })),
  };
}

/** 사진들이 붙은 장소 전부 — 카드마다 「이 사진은 어디에 붙었나」 를 보여준다 */
async function linksForPhotos(photoIds: string[]): Promise<LinkRow[]> {
  const admin = createAdminClient();
  const out: LinkRow[] = [];
  for (let i = 0; i < photoIds.length; i += 100) {
    const { data } = await admin
      .from("spot_photos")
      .select("spot_id, photo_id, source, excluded, sort")
      .in("photo_id", photoIds.slice(i, i + 100));
    out.push(...((data ?? []) as LinkRow[]));
  }
  return out;
}

async function photosByIds(ids: string[]): Promise<PhotoRow[]> {
  const admin = createAdminClient();
  const out: PhotoRow[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin.from("photos").select(PHOTO_COLS).in("id", ids.slice(i, i + 100));
    out.push(...((data ?? []) as unknown as PhotoRow[]));
  }
  return out;
}

/** 한 장소에 붙은 사진 — 뺀 것 포함, 지면 순서(수동 먼저 → 자동 순서 → 뺀 것) */
export async function listPhotosOfSpot(spotId: string): Promise<AdminSpotPhoto[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("spot_photos")
    .select("spot_id, photo_id, source, excluded, sort")
    .eq("spot_id", spotId)
    .order("excluded", { ascending: true })
    .order("source", { ascending: false })
    .order("sort", { ascending: true });
  const rows = (data ?? []) as LinkRow[];
  const ids = rows.map((r) => r.photo_id);
  const [photos, links] = await Promise.all([photosByIds(ids), linksForPhotos(ids)]);
  const byId = new Map(photos.map((p) => [p.id, p]));
  return ids.flatMap((id) => {
    const p = byId.get(id);
    return p ? [toAdminPhoto(p, links)] : [];
  });
}

/**
 * 장소 메모로 사진 찾기 — 운영자가 장소에 직접 넣을 사진을 고를 때.
 * `q` 가 비면 「장소 메모는 있는데 어느 장소에도 안 붙은 공개 사진」 을 보여준다.
 */
export async function searchPhotosForSpots(q: string, limit = 60): Promise<AdminSpotPhoto[]> {
  const admin = createAdminClient();
  const term = q.trim().replace(/[%,()]/g, "");

  if (term) {
    const { data } = await admin
      .from("photos")
      .select(PHOTO_COLS)
      .ilike("location_text", `%${term}%`)
      .order("created_at", { ascending: false })
      .limit(limit);
    const photos = (data ?? []) as unknown as PhotoRow[];
    const links = await linksForPhotos(photos.map((p) => p.id));
    return photos.map((p) => toAdminPhoto(p, links));
  }

  // 장소 메모가 있는 공개 사진 중 연결이 하나도 없는 것
  const photos: PhotoRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("photos")
      .select(PHOTO_COLS)
      .eq("visibility", "published")
      .eq("feed_hidden", false)
      .not("location_text", "is", null)
      .neq("location_text", "")
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    photos.push(...((data ?? []) as unknown as PhotoRow[]));
    if ((data ?? []).length < 1000) break;
  }
  const linkedIds = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("spot_photos").select("photo_id").range(from, from + 999);
    for (const r of data ?? []) linkedIds.add(r.photo_id as string);
    if ((data ?? []).length < 1000) break;
  }
  return photos
    .filter((p) => !linkedIds.has(p.id))
    .slice(0, limit)
    .map((p) => toAdminPhoto(p, []));
}

import "server-only";

import { createClient } from "@/lib/supabase/server";

export type HomeBanner = {
  id: string;
  title: string;
  image_url: string;
  thumb_url: string | null;
  width: number | null;
  height: number | null;
  link_url: string | null;
  published: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
};

const COLS =
  "id, title, image_url, thumb_url, width, height, link_url, published, sort_order, starts_at, ends_at";

// 노출용 — 공개 + 노출기간 안(RLS 가 동일 조건으로 한 번 더 거른다). 실패해도 배너만 빠지고 페이지는 산다.
export async function fetchActiveBanners(): Promise<HomeBanner[]> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("home_banners")
    .select(COLS)
    .eq("published", true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as HomeBanner[];
}

// 어드민용 — 비공개·기간 지난 것 포함 전체. (RLS is_admin)
export async function listAllBanners(): Promise<HomeBanner[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("home_banners")
    .select(COLS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as HomeBanner[];
}

// 배너 링크 검증 — 내부 경로(/...) 또는 https 외부 링크만 허용. 그 외는 링크 없음 처리.
export function safeBannerHref(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  if (/^https:\/\/[^\s]+$/i.test(v)) return v;
  return null;
}

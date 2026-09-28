import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isBannerLive } from "./banner-state";

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

// 노출용 — 공개 + 노출기간 안. 실패해도 배너만 빠지고 페이지는 산다.
//
// 기간 판정을 **DB 에 맡기지 않고 JS 로 한다.** RLS(home_banners_select)가 published 와
// 기간을 이미 같은 조건으로 거르므로 여기서 or() 를 겹쳐 걸 이유가 없었고, 겹쳐 두면
// 어드민(lib/banner-state)과 조건이 **두 벌**이 된다. 두 벌이면 언젠가 갈라지고,
// 갈라진 날 어드민은 「노출 중」인데 홈에는 안 뜬다 — 그걸 알아채기가 아주 어렵다.
// 배너는 수십 장 규모라 전부 받아 거르는 비용이 없다.
export async function fetchActiveBanners(): Promise<HomeBanner[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("home_banners")
    .select(COLS)
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return [];
  return ((data ?? []) as HomeBanner[]).filter((b) => isBannerLive(b));
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

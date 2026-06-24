import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

// 하루 1회 재생성 — 공개 작가·사진은 자주 바뀌므로.
export const revalidate = 86400;

const STATIC_ROUTES = ["", "/apply", "/c/mood", "/c/wedding", "/c/couple", "/c/portrait", "/c/place"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.7,
  }));

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("photos")
      .select("id, photographer_id, updated_at")
      .eq("visibility", "published")
      .order("created_at", { ascending: false })
      .limit(5000);

    const rows = data ?? [];
    const photographerIds = [...new Set(rows.map((r) => r.photographer_id).filter(Boolean))];

    const photographerEntries: MetadataRoute.Sitemap = photographerIds.map((id) => ({
      url: `${SITE_URL}/photographers/${id}`,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    const photoEntries: MetadataRoute.Sitemap = rows.map((r) => ({
      url: `${SITE_URL}/photos/${r.id}`,
      lastModified: r.updated_at ? new Date(r.updated_at as string) : undefined,
      changeFrequency: "monthly",
      priority: 0.5,
    }));

    return [...staticEntries, ...photographerEntries, ...photoEntries];
  } catch {
    // DB 접근 실패 시에도 정적 경로 sitemap 은 제공
    return staticEntries;
  }
}

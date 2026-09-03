import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type Article = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body_md: string;
  cover_url: string | null;
  cover_alt: string;
  published: boolean;
  sort_order: number;
  published_at: string | null;
  updated_at: string;
};

const COLS =
  "id, slug, title, summary, body_md, cover_url, cover_alt, published, sort_order, published_at, updated_at";

/** 목록용 — 본문(body_md)은 빼서 가볍게. 목록에서 수십 KB 본문을 끌고 올 이유가 없다. */
export type ArticleCard = Omit<Article, "body_md">;
const CARD_COLS =
  "id, slug, title, summary, cover_url, cover_alt, published, sort_order, published_at, updated_at";

// 공개 목록. RLS 가 published 를 한 번 더 거르지만 조건을 명시해 의도를 남긴다.
export async function listPublishedArticles(): Promise<ArticleCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("articles")
    .select(CARD_COLS)
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as ArticleCard[];
}

// 공개 글 1건. 비공개·미존재는 null.
export async function getPublishedArticle(slug: string): Promise<Article | null> {
  const decoded = safeDecode(slug);
  const supabase = await createClient();
  const { data } = await supabase
    .from("articles")
    .select(COLS)
    .eq("slug", decoded)
    .eq("published", true)
    .maybeSingle();
  return (data as Article) ?? null;
}

// 어드민 — 초안 포함 전체. (RLS is_admin)
export async function listAllArticles(): Promise<ArticleCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("articles")
    .select(CARD_COLS)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });
  return (data ?? []) as ArticleCard[];
}

export async function getArticleForAdmin(id: string): Promise<Article | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("articles").select(COLS).eq("id", id).maybeSingle();
  return (data as Article) ?? null;
}

/**
 * sitemap 용 — 요청 컨텍스트가 없는 자리라 admin 클라이언트를 쓴다.
 * admin 은 RLS 를 우회하므로 published 를 **명시적으로** 건다(안 걸면 초안이 sitemap 에 샌다).
 */
export async function listPublishedArticleSlugs(): Promise<
  Array<{ slug: string; updated_at: string }>
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("articles")
    .select("slug, updated_at")
    .eq("published", true)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => ({
    slug: String(r.slug),
    updated_at: String(r.updated_at),
  }));
}

// Next.js 16: 동적 라우트 param 은 자동 디코딩되지 않는다. 한글 slug 를 쓰므로 직접 푼다.
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * 제목 → slug. 한글을 그대로 남긴다 — 한국어 검색에서 URL 키워드가 유리하다.
 * (guide 쪽 슬러그 규칙과 같은 방식)
 */
export function slugifyTitle(title: string): string {
  return title
    .trim()
    .replace(/[?!."'`·…]/g, "")
    .replace(/[()[\]{}<>/\\]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** 본문에서 읽는 시간(분) 추정. 한국어는 분당 약 500자로 잡는다. */
export function readingMinutes(bodyMd: string): number {
  return Math.max(1, Math.round(bodyMd.replace(/\s+/g, "").length / 500));
}

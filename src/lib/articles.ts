import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
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
//
// ⚠️ **쿠키 클라이언트를 쓰면 안 된다.** `createClient()` 는 cookies() 를 읽어서 지면을
//    통째로 동적 렌더로 떨어뜨린다 — `/articles` 와 `/articles/[slug]` 에 적힌
//    `revalidate = 86400` 이 그래서 한 번도 먹지 않았다(실측 2026-09-18: 두 지면만
//    x-vercel-cache MISS, 같은 성격인 /spots·/guide 는 HIT). 공개 글은 로그인 여부에
//    따라 달라지지 않으니 익명 클라이언트가 맞다 — spots.ts·guide.ts 와 같은 방식.
export async function listPublishedArticles(): Promise<ArticleCard[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("articles")
    .select(CARD_COLS)
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as ArticleCard[];
}

/**
 * 공개 글 **본문까지** — RSS 피드(app/rss.xml)만 쓴다.
 *
 * 목록용(listPublishedArticles)은 일부러 body_md 를 뺀다. 피드는 반대로 본문이 있어야
 * 한다 — 네이버가 "이미지 링크가 포함된 본문 전체" 를 권장한다. 5건에 5.6천자라
 * 한 번에 끌어와도 가볍다(실측 2026-09-26).
 */
export async function listPublishedArticlesWithBody(): Promise<Article[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("articles")
    .select(COLS)
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as Article[];
}

// 공개 글 1건. 비공개·미존재는 null. (위와 같은 이유로 익명 클라이언트)
export async function getPublishedArticle(slug: string): Promise<Article | null> {
  const decoded = safeDecode(slug);
  const supabase = createPublicClient();
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

/**
 * 글별 누적 조회수 — analytics_events pageview(/articles/{slug}) 집계. {slug: n}
 *
 * articles 에 카운터 컬럼이 없어 이벤트를 세서 만든다. 요청 컨텍스트가 없는
 * ISR 재생성에서도 돌아야 하므로 admin 클라이언트를 쓴다(경로 집계라 개인정보 없음).
 * 경로의 한글 slug 는 URL 인코딩돼 있어 디코딩해서 slug 와 맞춘다.
 */
export async function countArticleViews(): Promise<Record<string, number>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("analytics_events")
    .select("path")
    .eq("type", "pageview")
    .like("path", "/articles/%")
    .limit(100000);
  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    const m = ((r.path as string) || "").match(/^\/articles\/([^/?#]+)/);
    if (!m) continue;
    const slug = safeDecode(m[1]);
    out[slug] = (out[slug] ?? 0) + 1;
  }
  return out;
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

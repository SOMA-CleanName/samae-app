import "server-only";

// 공개 조회는 **anon(쿠키 없는 클라이언트)** 이다.
//
// `/guide/[slug]` 는 generateStaticParams 로 프리렌더되는데, 그건 HTTP 요청 없이
// 빌드 타임에 돈다. 쿠키를 읽는 server 클라이언트를 쓰면 거기서 빌드가 죽는다
// ("used cookies() inside generateStaticParams"). spots.ts 에 같은 이유가 적혀 있다.
// RLS 가 published 를 대신 걸러 주므로 보안도 더 낫다.
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
// 순수 함수라 떼어 뒀다 — 여기는 server-only 라 테스트에서 못 부른다
import { decodeSlug } from "@/lib/guide-slug";

/**
 * Q&A — 운영자가 쓰고 고치는 짧은 문답.
 *
 * 원래는 `src/lib/guide-data.ts` 에 317줄로 박혀 있었다. 아티클(0107)은 이미 DB 인데
 * 이것만 파일이라, 문구 한 줄 고치려면 배포를 해야 했다. 0112 로 DB 로 옮겼다.
 *
 * 파일 시절의 **파생 규칙은 그대로 가져온다** — 축 순서, thin content 기준.
 * 그 둘은 SEO 판단이라 데이터가 어디 있든 같아야 한다.
 */

export type GuideAxis = "field" | "client" | "maker" | "taste" | "scene";

export type GuideItem = {
  id: string;
  slug: string;
  question: string;
  answer: string;
  axis: GuideAxis;
  axisLabel: string;
  published: boolean;
  sortOrder: number;
};

const COLS = "id, slug, question, answer, axis, axis_label, published, sort_order";

type Row = {
  id: string;
  slug: string;
  question: string;
  answer: string;
  axis: string;
  axis_label: string;
  published: boolean;
  sort_order: number;
};

function toItem(r: Row): GuideItem {
  return {
    id: r.id,
    slug: r.slug,
    question: r.question,
    answer: r.answer,
    axis: r.axis as GuideAxis,
    axisLabel: r.axis_label,
    published: r.published,
    sortOrder: r.sort_order,
  };
}

/** 허브에서 축 순서를 고정한다 — 준비 → 실전 → 읽기 → 작가 → 시장 순으로 읽히게. */
export const AXIS_ORDER: GuideAxis[] = ["client", "field", "taste", "maker", "scene"];

/**
 * 개별 페이지를 만들 기준 길이.
 *
 * 짧은 답(80자 이하가 다수)은 단독 페이지로 두면 thin content 라 색인 품질을 깎는다.
 * 허브에는 전부 싣되, **본문이 충분한 것만** 자기 URL 을 갖는다.
 */
const MIN_PAGE_LEN = 200;

/** 공개된 전부 — 허브(/guide)에 싣는다. RLS 가 published 를 한 번 더 거르지만 조건을 명시한다. */
export async function listPublishedGuideItems(): Promise<GuideItem[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("guide_items")
    .select(COLS)
    .eq("published", true)
    .order("sort_order", { ascending: true });
  if (error) return [];
  return ((data ?? []) as Row[]).map(toItem);
}

/** 자기 URL 을 갖는 것만 — 개별 페이지·사이트맵·다른 지면의 링크 목록. */
export async function listGuidePageItems(): Promise<GuideItem[]> {
  return (await listPublishedGuideItems()).filter((g) => g.answer.length >= MIN_PAGE_LEN);
}

export async function findGuideItem(slug: string): Promise<GuideItem | null> {
  const decoded = decodeSlug(slug);
  // 짧은 답은 자기 URL 이 없다 — 허브에만 있다. 그래서 page 목록에서 찾는다.
  return (await listGuidePageItems()).find((g) => g.slug === decoded) ?? null;
}

/** 어드민 — 비공개 초안까지 전부. 서비스 롤로 RLS 를 우회한다. */
export async function listAllGuideItems(): Promise<GuideItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("guide_items")
    .select(COLS)
    .order("axis", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) return [];
  return ((data ?? []) as Row[]).map(toItem);
}

/**
 * 질문에서 slug 를 만든다.
 *
 * 한글을 그대로 남긴다 — 검색에서 키워드가 URL 에 들어가는 게 유리하고, 기존 33건이
 * 이미 그 형식이다(`여백이-많은-사진이-좋아-보이는-조건은-뭔가`). 형식을 바꾸면
 * 이미 색인된 URL 이 전부 깨진다.
 */
export function slugifyQuestion(question: string): string {
  return question
    .trim()
    .replace(/[?!.,'"“”‘’·:;()[\]{}]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80)
    .replace(/-+$/, "");
}

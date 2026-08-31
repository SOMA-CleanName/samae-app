import type { Metadata } from "next";
import { SITE_URL, SITE_NAME } from "@/lib/site";

// SEO 공용 — 페이지별 동적 메타데이터 + 구조화데이터(JSON-LD) 빌더.
// 브랜드는 한/영 병기(samae · 사매)로 한글 검색 노출을 강화. 작가 실명은 노출 금지(익명 정책).

const KRW = new Intl.NumberFormat("ko-KR");
const BRAND_KEYWORDS = ["samae", "사매", "사진작가", "스냅 촬영", "프로필 사진", "사진 예약", "촬영 문의"];

function priceText(krw: number | null | undefined): string | null {
  return krw != null ? `촬영 시작 ₩${KRW.format(krw)}` : null;
}
function clean(parts: (string | null | undefined | false)[], sep = " · "): string {
  return parts.filter(Boolean).join(sep);
}

// ── 사진 상세 ────────────────────────────────────────────────
export type PhotoMeta = {
  id: string;
  src_url: string;
  width?: number | null;
  height?: number | null;
  mood_tags?: string[] | null;
  region?: string | null;
  location_text?: string | null;
  price_krw?: number | null;
};

export function photoMetadata(photo: PhotoMeta): Metadata {
  const tags = (photo.mood_tags ?? []).slice(0, 3);
  const rawPlace = photo.region || photo.location_text || undefined;
  const place = rawPlace && !tags.includes(rawPlace) ? rawPlace : undefined; // 태그와 중복 방지
  const subject = clean([tags.join(" "), place], " ") || "사진작가의 사진";
  const title = `${subject} 사진`;
  const description = clean(
    [
      "이 느낌 그대로 촬영을 문의해보세요.",
      clean([tags.join("·"), place, priceText(photo.price_krw)]),
      "samae(사매)에서 마음에 든 사진의 작가에게 무료 상담.",
    ],
    " "
  );
  const url = `${SITE_URL}/photos/${photo.id}`;
  const img = photo.src_url;
  return {
    title,
    description,
    keywords: [...tags, place, ...BRAND_KEYWORDS].filter(Boolean) as string[],
    alternates: { canonical: `/photos/${photo.id}` },
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url,
      type: "article",
      images: img ? [{ url: img, width: photo.width ?? undefined, height: photo.height ?? undefined }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description, images: img ? [img] : undefined },
  };
}

// ── 작가 프로필 (실명 미노출) ─────────────────────────────────
export type PhotographerMeta = {
  id: string;
  regions?: string[] | null;
  mood_tags?: string[] | null;
  price_from_krw?: number | null;
  bio?: string | null;
  avatar_url?: string | null;
};

export function photographerMetadata(ph: PhotographerMeta): Metadata {
  const region = (ph.regions ?? [])[0];
  const moods = (ph.mood_tags ?? []).slice(0, 2);
  const subject = clean([region, moods.join(" ")], " ");
  const title = `${subject ? subject + " " : ""}사진작가`;
  const description =
    ph.bio?.trim()?.slice(0, 130) ||
    clean([`${subject || "감성"} 스타일 사진작가.`, priceText(ph.price_from_krw), "samae(사매)에서 무료 상담·예약."]);
  const url = `${SITE_URL}/photographers/${ph.id}`;
  return {
    title,
    description,
    keywords: [region, ...moods, "사진작가", ...BRAND_KEYWORDS].filter(Boolean) as string[],
    alternates: { canonical: `/photographers/${ph.id}` },
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url,
      type: "profile",
      images: ph.avatar_url ? [ph.avatar_url] : undefined,
    },
    twitter: { card: "summary", title, description },
  };
}

// ── 카테고리 ─────────────────────────────────────────────────
export function categoryMetadata(name: string, slug: string): Metadata {
  const title = `${name} 사진·사진작가`;
  const description = `${name} 무드의 사진과 작가를 samae(사매)에서 탐색하고 무료 상담·예약하세요.`;
  return {
    title,
    description,
    keywords: [name, ...BRAND_KEYWORDS],
    alternates: { canonical: `/c/${slug}` },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url: `${SITE_URL}/c/${slug}`, type: "website" },
  };
}

/**
 * 탐색 카테고리(무드·장면). `/c/` 와 달리 **롱테일 검색이 닿는 지점**이라 문구를 따로 쓴다.
 * subtitle 이 있으면 그대로 설명에 넣는다 — 운영자가 쓴 문장이 기계 문구보다 낫다.
 *
 * ⚠️ 2026-08-31 이전엔 이 페이지들에 generateMetadata 가 없어서
 *    탐색 19개가 전부 루트 레이아웃의 같은 제목·설명을 썼다. 검색엔진 눈엔 중복 페이지다.
 */
export function exploreCategoryMetadata(args: {
  title: string;
  subtitle?: string | null;
  slug: string;
}): Metadata {
  const title = `${args.title} 스냅 사진`;
  const description = clean(
    [
      args.subtitle || `${args.title} 분위기의 스냅 사진 모음.`,
      "마음에 든 사진의 작가에게 바로 촬영을 문의할 수 있어요 — samae(사매).",
    ],
    " "
  );
  const path = `/explore/${encodeURIComponent(args.slug)}`;
  return {
    title,
    description,
    keywords: [args.title, "스냅", ...BRAND_KEYWORDS],
    alternates: { canonical: path },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url: `${SITE_URL}${path}`, type: "website" },
  };
}

// ── 구조화데이터 (JSON-LD) ───────────────────────────────────
export function siteJsonLd(): object[] {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "samae",
    alternateName: ["사매", "samae.ai"],
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    description: "취향에 맞는 사진작가를 탐색·상담·예약하는 사진 촬영 매칭 플랫폼.",
    // 소셜 계정이 생기면 sameAs 에 추가 (브랜드 검색 강화)
  };
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "samae · 사매",
    alternateName: "사매",
    url: SITE_URL,
    inLanguage: "ko",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
  return [organization, website];
}

// ── GEO(AI 답변 인용) 를 위한 빌더 ──────────────────────────
// AI 답변은 "질문-답 쌍"과 "가격이 붙은 상품"을 가장 잘 인용한다.
// 아래 셋이 그 두 가지를 사실 단위로 만들어 준다.

/** 이동 경로. 사이트 구조를 검색엔진에 알려준다. */
export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE_URL}${t.path}`,
    })),
  };
}

/**
 * 목록 페이지(탐색·카테고리). 개별 사진이 함께 노출될 확률을 올린다.
 * 사진이 없으면 빈 ItemList 대신 null 을 돌려 아무것도 심지 않는다 — 빈 구조는 오히려 감점이다.
 */
export function collectionJsonLd(args: {
  title: string;
  description?: string | null;
  path: string;
  photoIds: string[];
}): object | null {
  if (args.photoIds.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: args.title,
    ...(args.description ? { description: args.description } : {}),
    url: `${SITE_URL}${args.path}`,
    inLanguage: "ko",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: args.photoIds.length,
      itemListElement: args.photoIds.slice(0, 30).map((id, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/photos/${id}`,
      })),
    },
  };
}

export type PackageMeta = {
  id: string;
  name: string;
  description?: string | null;
  price_krw?: number | null;
  duration_min?: number | null;
  edited_count?: number | null;
};

/**
 * 작가의 촬영 패키지 → Product + Offer.
 * **가격은 AI 답변에 가장 잘 인용되는 필드다.** "성수 스냅 얼마?" 류 질문에 우리가 답이 된다.
 *
 * ⚠️ 작가 실명은 넣지 않는다(익명 정책). seller 는 브랜드로 둔다.
 * ⚠️ 가격이 없는 패키지는 제외한다 — Offer 에 price 가 없으면 무효 구조라 경고가 뜬다.
 */
export function packagesJsonLd(photographerId: string, packages: PackageMeta[]): object | null {
  const priced = packages.filter((p) => typeof p.price_krw === "number" && p.price_krw! > 0);
  if (priced.length === 0) return null;
  const url = `${SITE_URL}/photographers/${photographerId}`;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "촬영 패키지",
    itemListElement: priced.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: p.name,
        ...(p.description ? { description: p.description } : {}),
        url,
        category: "사진 촬영",
        offers: {
          "@type": "Offer",
          price: p.price_krw,
          priceCurrency: "KRW",
          availability: "https://schema.org/InStock",
          url,
          seller: { "@type": "Organization", name: SITE_NAME },
        },
      },
    })),
  };
}

/**
 * 아티클(롱폼 글). 검색·AI 가 "언제 쓰였고 누가 썼는지"를 판단하는 근거가 된다.
 *
 * ⚠️ author 는 개인이 아니라 조직으로 둔다 — 작가 실명 비노출 정책과 같은 선이고,
 *    운영자 개인을 노출할 이유도 없다.
 */
export function articleJsonLd(args: {
  slug: string;
  title: string;
  summary: string;
  coverUrl?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
}): object {
  const url = `${SITE_URL}/articles/${encodeURIComponent(args.slug)}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: args.title,
    description: args.summary,
    inLanguage: "ko",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    ...(args.coverUrl ? { image: args.coverUrl } : {}),
    ...(args.publishedAt ? { datePublished: args.publishedAt } : {}),
    ...(args.updatedAt ? { dateModified: args.updatedAt } : {}),
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
    },
  };
}

/**
 * 질문-답 묶음. **AI 인용률이 가장 높은 타입이다.**
 * 답이 비어 있으면 항목을 버린다 — 빈 답은 구조 오류로 잡힌다.
 */
export function faqJsonLd(items: Array<{ q: string; a: string }>): object | null {
  const valid = items.filter((x) => x.q.trim() && x.a.trim());
  if (valid.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "ko",
    mainEntity: valid.map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: { "@type": "Answer", text: x.a },
    })),
  };
}

export function photoImageJsonLd(photo: PhotoMeta): object {
  const url = `${SITE_URL}/photos/${photo.id}`;
  const place = photo.region || photo.location_text || undefined;
  return {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    contentUrl: photo.src_url,
    url,
    ...(photo.width ? { width: photo.width } : {}),
    ...(photo.height ? { height: photo.height } : {}),
    name: clean([(photo.mood_tags ?? []).slice(0, 3).join(" "), place]) || "사진작가의 사진",
    creator: { "@type": "Person", name: "사진작가" },
    isPartOf: { "@type": "WebSite", name: "samae", url: SITE_URL },
    // 촬영 장소를 사실 단위로 만든다. "성수에서 찍은 사진" 같은 장소 질의에 걸리는 지점이다.
    ...(place ? { contentLocation: { "@type": "Place", name: place } } : {}),
    ...((photo.mood_tags ?? []).length ? { keywords: (photo.mood_tags ?? []).join(", ") } : {}),
  };
}

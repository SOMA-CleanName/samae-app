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
  };
}

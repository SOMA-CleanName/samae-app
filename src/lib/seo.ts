import type { Metadata } from "next";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { displayPlace } from "@/lib/location-text";

// SEO 공용 — 페이지별 동적 메타데이터 + 구조화데이터(JSON-LD) 빌더.
// 브랜드는 한/영 병기(samae · 사매)로 한글 검색 노출을 강화. 작가 실명은 노출 금지(익명 정책).

const KRW = new Intl.NumberFormat("ko-KR");
const BRAND_KEYWORDS = ["samae", "사매", "사진작가", "스냅 촬영", "프로필 사진", "사진 예약", "촬영 문의"];

/**
 * 공유 카드에 쓸 기본 이미지.
 *
 * ⚠️ **페이지가 `openGraph` 를 직접 쓰면 루트의 이미지를 물려받지 못한다.** Next 의
 *    파일 컨벤션(`app/opengraph-image.png`)은 자식이 openGraph 를 재정의하는 순간
 *    끊긴다. 그래서 지면마다 제목·설명은 잘 나가는데 **이미지만 조용히 빠진다.**
 *
 *    실측 2026-09-17 — og:image 가 없던 지면: `/guide/{slug}` · `/spots/{slug}` ·
 *    `/explore/{slug}` · `/c/{slug}`. 카카오톡·스레드·슬랙에 붙여도 카드가 안 서고,
 *    이미지 없는 링크는 클릭률이 눈에 띄게 낮다. 그 넷이 하필 우리가 밖에 뿌리는 지면이다.
 *
 * 📌 그 지면의 **실제 사진**이 있으면 그걸 쓰는 게 낫다(아티클이 cover_url 로 그렇게 한다).
 *    이건 그게 없을 때의 바닥이다.
 */
export const OG_DEFAULT_IMAGE = `${SITE_URL}/opengraph-image.png`;

/** openGraph 에 넣을 이미지 — 지면 고유 이미지가 없으면 기본값으로 떨어진다 */
export function ogImages(url?: string | null) {
  return [{ url: url || OG_DEFAULT_IMAGE }];
}

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

/**
 * 사진 한 장을 사람 말로 부르는 이름.
 *
 * 사진에는 제목이 없어서 태그와 촬영지로 짓는다.
 * <title> 과 지면의 h1 이 이걸 같이 쓴다 — 따로 지으면 검색 결과에 뜨는 이름과
 * 페이지 안의 이름이 어긋난다.
 */
export function photoTitle(photo: PhotoMeta): string {
  const tags = (photo.mood_tags ?? []).slice(0, 3);
  const rawPlace = photo.region || displayPlace(photo.location_text) || undefined;
  const place = rawPlace && !tags.includes(rawPlace) ? rawPlace : undefined; // 태그와 중복 방지
  const subject = clean([tags.join(" "), place], " ") || "사진작가의 사진";
  return `${subject} 사진`;
}

export function photoMetadata(photo: PhotoMeta): Metadata {
  const tags = (photo.mood_tags ?? []).slice(0, 3);
  const rawPlace = photo.region || displayPlace(photo.location_text) || undefined;
  const place = rawPlace && !tags.includes(rawPlace) ? rawPlace : undefined; // 태그와 중복 방지
  const title = photoTitle(photo);
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
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/c/${slug}`,
      type: "website",
      images: ogImages(),
    },
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
  /** 이 큐레이션의 대표 사진 — 있으면 공유 카드에 그걸 쓴다 */
  coverUrl?: string | null;
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
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url: `${SITE_URL}${path}`,
      type: "website",
      images: ogImages(args.coverUrl),
    },
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
 * 작가의 촬영 패키지 → **Service** + Offer.
 *
 * **가격은 AI 답변에 가장 잘 인용되는 필드다.** "성수 스냅 얼마?" 류 질문에 우리가 답이 된다.
 *
 * 🔴 **2026-09-24 — 전에는 `Product` 였다.** 그러자 구글이 이걸 **판매 상품**으로 보고
 *    「판매자 목록(merchant listing)」 규칙을 적용해 경고를 보냈다 —
 *    `hasMerchantReturnPolicy`·`shippingDetails`·`gtin`/`brand` 누락, `category` 무효.
 *
 *    **그 요구는 만족시킬 수 없고, 만족시키려 하면 거짓이 된다.** 촬영은 배송되지 않고
 *    반품되지도 않는다. 사진 구조화 데이터에서 「Licensable」 배지를 일부러 뺀 것과 같은
 *    이유다 — 아닌 것을 맞다고 공표하지 않는다.
 *
 *    `Service` 는 애초에 그 규칙의 대상이 아니라 경고가 **사라지는 게 아니라 적용되지
 *    않는다.** 가격(Offer)은 그대로라 원래 목적은 유지된다.
 *
 * ⚠️ 작가 실명은 넣지 않는다(익명 정책). provider·seller 는 브랜드로 둔다.
 * ⚠️ 가격이 없는 패키지는 제외한다 — Offer 에 price 가 없으면 무효 구조라 경고가 뜬다.
 */
export function packagesJsonLd(
  photographerId: string,
  packages: PackageMeta[],
  opts: {
    /** 대표 사진. 구글이 **심각(critical)** 으로 잡은 `image` 누락이 이것이다 */
    imageUrl?: string | null;
    /** 후기가 **실제로 있을 때만** 별점을 싣는다 (없는 평판을 만들지 않는다) */
    ratingAvg?: number | null;
    reviewCount?: number | null;
  } = {}
): object | null {
  const priced = packages.filter((p) => typeof p.price_krw === "number" && p.price_krw! > 0);
  if (priced.length === 0) return null;
  const url = `${SITE_URL}/photographers/${photographerId}`;
  const provider = { "@type": "Organization", name: SITE_NAME } as const;

  /*
    별점은 **후기가 1건이라도 있을 때만.** rating_avg 는 후기가 없으면 0 인데, 그대로
    내보내면 "별 0개짜리 서비스" 를 공표하는 꼴이다. 구글이 aggregateRating 누락을
    「심각하지 않음」 으로 분류한 이유도 이것 — 없으면 비우는 게 맞다.
  */
  const rating =
    opts.reviewCount && opts.reviewCount > 0 && opts.ratingAvg && opts.ratingAvg > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: opts.ratingAvg,
            reviewCount: opts.reviewCount,
          },
        }
      : {};

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "촬영 패키지",
    itemListElement: priced.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Service",
        name: p.name,
        ...(p.description ? { description: p.description } : {}),
        url,
        // 구글 상품 분류(category)가 아니라 서비스 종류다. 전에 category:"사진 촬영" 을
        // 넣었더니 "값이 잘못되었습니다" 로 잡혔다 — 그건 상품 택소노미를 기대하는 칸이다.
        serviceType: "사진 촬영",
        ...(opts.imageUrl ? { image: opts.imageUrl } : {}),
        provider,
        ...rating,
        offers: {
          "@type": "Offer",
          price: p.price_krw,
          priceCurrency: "KRW",
          availability: "https://schema.org/InStock",
          url,
          seller: provider,
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

/**
 * 사진 한 장 → ImageObject.
 *
 * ⚠️ **저작권자는 작가다.** 작가 이용약관 제17조 1항("촬영 결과물의 저작권은 이를 촬영한
 *    작가에게 있습니다")과 제20조 5항("회사는 게재된 사진의 저작권을 취득하지 않는다")이
 *    그렇게 정한다. 그래서 `copyrightNotice`·`creditText` 에 **사매가 아니라 작가 이름**을
 *    넣는다. 여기에 회사 이름을 넣으면 약관과 어긋나는 주장을 구조화 데이터로 공표하는 셈이다.
 *
 * ⚠️ `license`·`acquireLicensePage` 는 **일부러 비워 둔다**(2026-09-21 결정).
 *    그 둘을 채우면 구글 이미지에 「Licensable」 배지가 붙는데, 그건 "이 사진의 라이선스를
 *    받을 수 있다" 는 안내다. 사매가 파는 것은 **촬영**이지 사진 파일이 아니고, 라이선스
 *    문의를 작가에게 연결하는 경로도 아직 없다. 없는 창구를 광고하면 안 된다.
 *    (약관 17조 2항상 작가와 협의하면 가능은 하다 — 그 경로를 만들면 그때 채운다)
 *    GSC 가 이 둘을 "누락" 으로 알리지만 **심각하지 않은 항목**이라 노출에 손해가 없다.
 */
export function photoImageJsonLd(photo: PhotoMeta, photographerName?: string | null): object {
  const url = `${SITE_URL}/photos/${photo.id}`;
  // 「협의」 를 contentLocation 으로 내보내면 **없는 장소를 사실로 공표**하게 된다
  const place = photo.region || displayPlace(photo.location_text) || undefined;
  // 이름을 모르면 예전처럼 일반명사로 둔다. 빈 크레딧을 내보내느니 낫다.
  const creator = (photographerName ?? "").trim() || "사진작가";
  return {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    contentUrl: photo.src_url,
    url,
    ...(photo.width ? { width: photo.width } : {}),
    ...(photo.height ? { height: photo.height } : {}),
    name: clean([(photo.mood_tags ?? []).slice(0, 3).join(" "), place]) || "사진작가의 사진",
    creator: { "@type": "Person", name: creator },
    copyrightNotice: `© ${creator}`,
    creditText: creator,
    isPartOf: { "@type": "WebSite", name: "samae", url: SITE_URL },
    // 촬영 장소를 사실 단위로 만든다. "성수에서 찍은 사진" 같은 장소 질의에 걸리는 지점이다.
    ...(place ? { contentLocation: { "@type": "Place", name: place } } : {}),
    ...((photo.mood_tags ?? []).length ? { keywords: (photo.mood_tags ?? []).join(", ") } : {}),
  };
}

/**
 * 장소 → Place.
 *
 * 주소를 통째 문자열로 넣지 않고 PostalAddress 로 쪼갠다. 지역 질의("중구 스냅")에
 * 걸리려면 addressRegion 이 필드로 서 있어야 한다.
 *
 * ⚠️ geo(위경도)는 넣지 않는다. 확인한 좌표가 없고, 틀린 좌표는 사람을 헛걸음시킨다.
 */
export function placeJsonLd(spot: {
  name: string;
  slug: string;
  description: string;
  area: string;
  address: string;
  photoUrls?: string[];
}): object {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: spot.name,
    description: spot.description,
    url: `${SITE_URL}/spots/${spot.slug}`,
    address: {
      "@type": "PostalAddress",
      addressCountry: "KR",
      addressLocality: "서울",
      addressRegion: spot.area,
      streetAddress: spot.address,
    },
    ...(spot.photoUrls?.length ? { photo: spot.photoUrls.slice(0, 6) } : {}),
  };
}

/** 목록 → ItemList. 순서가 의미를 갖는 목록에만 쓴다(사진 많은 순 등). */
export function itemListJsonLd(
  name: string,
  items: Array<{ name: string; path: string }>
): object | null {
  if (items.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: `${SITE_URL}${it.path}`,
    })),
  };
}

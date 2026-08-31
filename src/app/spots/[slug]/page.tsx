import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@/components/user/icons";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd, faqJsonLd, placeJsonLd } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { PUBLISHED_SPOTS, findSpot, type Spot } from "@/lib/spots-data";
import { fetchSpotDetail, formatKrw, type SpotDetail } from "@/lib/spots";
import { GUIDE_PAGE_ITEMS } from "@/lib/guide-data";

// 장소 상세.
//
// 구성은 기획서(docs/proposals/seo-geo-plan.md §P2) 그대로다.
//   ① 소개  ② 여기서 찍힌 사진  ③ 여기서 찍는 작가  ④ 대략의 비용  ⑤ 팁  ⑥ FAQ
// ②③④ 가 블로그에 없는 것이고, 그것 때문에 AI 가 우리를 인용한다.
export const revalidate = 86400;

export function generateStaticParams() {
  return PUBLISHED_SPOTS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const spot = findSpot(slug);
  if (!spot) return {};
  const title = `${spot.name} 스냅 촬영`;
  const description = `${spot.name}(${spot.area})에서 찍은 사진과 이곳에서 촬영하는 작가, 대략의 비용까지. ${spot.desc}`;
  return {
    title,
    description,
    alternates: { canonical: `/spots/${spot.slug}` },
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/spots/${spot.slug}`,
      type: "website",
    },
  };
}

/**
 * 가이드 원문에서 앞 문단만 떼어 온다.
 *
 * FAQ 답을 새로 쓰지 않고 여기서 가져오는 이유: 가이드 원고는 사실 검증·화자·업계단정
 * 심사를 이미 통과한 글이다. 답을 새로 지어내면 그 심사를 우회하게 된다.
 */
function guideExcerpt(slug: string, paragraphs = 3): { text: string; href: string } | null {
  const item = GUIDE_PAGE_ITEMS.find((g) => g.slug === slug);
  if (!item) return null;
  const text = item.answer.split("\n\n").slice(0, paragraphs).join(" ").trim();
  return { text, href: `/guide/${encodeURIComponent(item.slug)}` };
}

/** FAQ 는 전부 (a) DB 에서 계산된 사실 또는 (b) QC 통과 원문에서만 만든다. */
function buildFaq(spot: Spot, d: SpotDetail): Array<{ q: string; a: string; href?: string }> {
  const out: Array<{ q: string; a: string; href?: string }> = [];

  // 화면에는 24장만 걸지만 답은 전체 수로 한다. 표시 상한을 사실로 말하면 안 된다.
  out.push({
    q: `${spot.name}에서 찍은 사진을 볼 수 있나요?`,
    a: `사매에 공개된 사진 중 ${d.totalCount}장이 ${spot.name} 일대에서 촬영됐어요. 사진마다 찍은 작가로 이어지고, 그 작가에게 바로 문의할 수 있어요.`,
  });

  if (d.priceRange) {
    const { min, max } = d.priceRange;
    const range = min === max ? formatKrw(min) : `${formatKrw(min)}~${formatKrw(max)}`;
    out.push({
      q: `${spot.name} 스냅 촬영은 대략 얼마인가요?`,
      a: `이곳에서 촬영한 작가 ${d.photographers.length}명의 패키지 최저가가 ${range} 선이에요. 인원·촬영 시간·보정 장수에 따라 달라지니 정확한 금액은 작가에게 문의해 주세요.`,
    });
  }

  out.push({
    q: `${spot.name}은 언제 가는 게 좋나요?`,
    a: spot.tip,
  });

  const rain = guideExcerpt("촬영-당일-비가-오면");
  if (rain) {
    out.push({
      q: "촬영 당일 비가 오면 어떻게 하나요?",
      a: rain.text,
      href: rain.href,
    });
  }

  return out;
}

export default async function SpotDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const spot = findSpot(slug);
  if (!spot) notFound();

  const detail = await fetchSpotDetail(spot);

  // 사진이 없으면 소개글만 남는데, 그건 블로그가 더 잘 쓴다. 낼 이유가 없다.
  if (detail.photos.length === 0) notFound();

  const faq = buildFaq(spot, detail);
  const relatedGuides = GUIDE_PAGE_ITEMS.filter((g) => g.axis === "field").slice(0, 4);

  const faqLd = faqJsonLd(faq.map((f) => ({ q: f.q, a: f.a })));
  const structured = [
    placeJsonLd({
      name: spot.name,
      slug: spot.slug,
      description: spot.desc,
      area: spot.area,
      address: spot.address,
      photoUrls: detail.photos.map((p) => p.src_url),
    }),
    breadcrumbJsonLd([
      { name: "홈", path: "/" },
      { name: "촬영 장소", path: "/spots" },
      { name: spot.name, path: `/spots/${spot.slug}` },
    ]),
    ...(faqLd ? [faqLd] : []),
  ];

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 font-kr">
      <JsonLd data={structured} />

      <Link
        href="/spots"
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon className="h-4 w-4" /> 촬영 장소
      </Link>

      {/* ① 소개 */}
      <h1 className="text-2xl font-bold tracking-tight">{spot.name}</h1>
      <p className="mt-1 text-xs text-muted">
        {spot.area}
        {spot.station && <> · {spot.station}</>}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-fg/85">{spot.desc}</p>
      <p className="mt-1.5 text-xs text-muted">{spot.address}</p>

      {/* ② 여기서 찍힌 사진 */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold tracking-tight text-muted">
          여기서 찍힌 사진 {detail.totalCount}장
          {detail.totalCount > detail.photos.length && (
            <span className="ml-1 font-normal">
              (최근 {detail.photos.length}장)
            </span>
          )}
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {detail.photos.map((p) => (
            <li key={p.id}>
              <Link href={`/photos/${p.id}`} className="group block overflow-hidden rounded-sm bg-surface-2">
                {/* 원격 도메인이 next.config 에 없을 수 있어 next/image 대신 <img> */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumb_url ?? p.src_url}
                  alt={`${spot.name}에서 촬영한 스냅 사진`}
                  loading="lazy"
                  className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ③ 여기서 찍는 작가 + ④ 대략의 비용 */}
      {detail.photographers.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold tracking-tight text-muted">
            여기서 촬영하는 작가
          </h2>
          {detail.priceRange && (
            <p className="mt-1.5 text-sm leading-relaxed text-fg/85">
              패키지 최저가는{" "}
              <b className="font-semibold">
                {detail.priceRange.min === detail.priceRange.max
                  ? formatKrw(detail.priceRange.min)
                  : `${formatKrw(detail.priceRange.min)}~${formatKrw(detail.priceRange.max)}`}
              </b>{" "}
              선이에요. 인원·시간·보정 장수에 따라 달라져요.
            </p>
          )}
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {detail.photographers.map((ph) => (
              <li key={ph.id}>
                <Link
                  href={`/photographers/${ph.id}`}
                  className="group flex items-baseline gap-2 py-3.5"
                >
                  <span className="text-sm font-semibold tracking-tight transition-colors group-hover:text-muted">
                    {ph.displayName}
                  </span>
                  <span className="text-xs text-muted">이곳 사진 {ph.photoCount}장</span>
                  {ph.minPriceKrw !== null && (
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">
                      {formatKrw(ph.minPriceKrw)}~
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ⑤ 촬영 팁 */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold tracking-tight text-muted">촬영 팁</h2>
        <p className="mt-2 border-l-2 border-brand pl-4 text-sm leading-relaxed text-fg/85">
          {spot.tip}
        </p>
      </section>

      {/* ⑥ FAQ */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold tracking-tight text-muted">자주 묻는 것</h2>
        <div className="mt-3 space-y-5">
          {faq.map((f) => (
            <article key={f.q}>
              <h3 className="text-base font-semibold leading-snug tracking-tight">{f.q}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fg/85">{f.a}</p>
              {f.href && (
                <Link
                  href={f.href}
                  className="mt-1 inline-block text-xs font-medium text-brand underline"
                >
                  자세히 보기
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* 이어 읽기 */}
      {relatedGuides.length > 0 && (
        <section className="mt-12 border-t border-line pt-6">
          <h2 className="text-sm font-semibold tracking-tight text-muted">촬영 전에 읽어두면</h2>
          <ul className="mt-3 space-y-2">
            {relatedGuides.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/guide/${encodeURIComponent(g.slug)}`}
                  className="text-sm leading-snug tracking-tight underline decoration-line underline-offset-4 transition-colors hover:text-muted"
                >
                  {g.question}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

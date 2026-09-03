import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { StickyBack } from "@/components/editorial/StickyBack";
import { SectionHead } from "@/components/editorial/SectionHead";
import { breadcrumbJsonLd, faqJsonLd, placeJsonLd } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { PUBLISHED_SPOTS, findSpot, type Spot } from "@/lib/spots-data";
import { fetchSpotDetail, formatKrw, type SpotDetail } from "@/lib/spots";
import { GUIDE_PAGE_ITEMS } from "@/lib/guide-data";
import { SpotPhotoGrid } from "./SpotPhotoGrid";

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

  /*
    지면이 소개→사진→작가→팁→문답으로 성격이 계속 바뀌는데 전부 같은 간격에 같은
    작은 회색 제목이라, 어디서 무슨 이야기가 끝나고 시작하는지가 안 보였다.
    번호 + 브랜드 규칙선(SectionHead)과 구획선으로 갈리는 자리를 눈에 보이게 한다.
  */
  const sections = [
    { id: "photos", title: "여기서 찍힌 사진", show: detail.photos.length > 0 },
    { id: "makers", title: "여기서 촬영하는 작가", show: detail.photographers.length > 0 },
    { id: "tip", title: "촬영 팁", show: true },
    { id: "faq", title: "자주 묻는 것", show: faq.length > 0 },
  ]
    .filter((s) => s.show)
    .map((s, i) => ({ ...s, no: String(i + 1).padStart(2, "0") }));
  const no = (id: string) => sections.find((s) => s.id === id)?.no ?? "";

  return (
    <main className="min-h-dvh bg-bg font-kr">
      <JsonLd data={structured} />

      <StickyBack href="/spots" meta={spot.area} maxWidth="42rem" />

      <div className="mx-auto max-w-2xl px-5 pb-24 pt-7">
        {/* ① 소개 */}
        <header>
          <p className="flex flex-wrap items-baseline gap-x-2 text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
            <span>{spot.area}</span>
            {spot.station && <span className="normal-case tracking-normal">{spot.station}</span>}
          </p>
          <h1 className="mt-1.5 text-[clamp(1.75rem,7vw,2.5rem)] font-extrabold leading-[1.1] tracking-[-0.035em]">
            {spot.name}
          </h1>
          <p className="mt-3 text-body leading-relaxed text-fg/85">{spot.desc}</p>
          <p className="mt-2 text-[11px] text-faint">{spot.address}</p>
        </header>

        {/* ② 여기서 찍힌 사진 */}
        {detail.photos.length > 0 && (
          <section className="mt-11 border-t border-line pt-8">
            <SectionHead
              no={no("photos")}
              title="여기서 찍힌 사진"
              lead={
                <>
                  공개된 사진 중 <b className="font-semibold tabular-nums text-fg">{detail.totalCount}장</b>이
                  이 일대에서 찍혔어요
                  {detail.totalCount > detail.photos.length && (
                    <span className="tabular-nums"> (최근 {detail.photos.length}장 표시)</span>
                  )}
                  . 사진을 누르면 그걸 찍은 작가로 이어져요.
                </>
              }
            />
            <SpotPhotoGrid
              photos={detail.photos.map((p) => ({ id: p.id, url: p.thumb_url ?? p.src_url }))}
              spotName={spot.name}
            />
          </section>
        )}

        {/* ③ 여기서 찍는 작가 + ④ 대략의 비용 */}
        {detail.photographers.length > 0 && (
          <section className="mt-11 border-t border-line pt-8">
            <SectionHead
              no={no("makers")}
              title="여기서 촬영하는 작가"
              lead={
                detail.priceRange ? (
                  <>
                    패키지 최저가는{" "}
                    <b className="font-semibold text-fg">
                      {detail.priceRange.min === detail.priceRange.max
                        ? formatKrw(detail.priceRange.min)
                        : `${formatKrw(detail.priceRange.min)}~${formatKrw(detail.priceRange.max)}`}
                    </b>{" "}
                    선이에요. 인원·시간·보정 장수에 따라 달라져요.
                  </>
                ) : (
                  "이름을 누르면 그 작가의 프로필로 이동해요."
                )
              }
            />
            <ul className="border-t border-line-strong">
              {detail.photographers.map((ph) => (
                <li key={ph.id} className="border-b border-line">
                  {/*
                    한 줄 전체가 프로필로 가는 문이다.
                    전에는 이름만 살짝 진했을 뿐 눌러도 되는지 안 보여서, 화살표와
                    이니셜 원을 붙이고 누르는 영역을 줄 전체로 넓혔다.
                  */}
                  <Link
                    href={`/photographers/${ph.id}`}
                    className="sp-maker group flex items-center gap-3 py-3.5"
                  >
                    <span
                      aria-hidden
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-body-sm font-bold text-brand-ink"
                    >
                      {ph.displayName.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-bold tracking-tight transition-colors group-hover:text-brand">
                        {ph.displayName}
                      </span>
                      <span className="mt-0.5 block text-[11px] tabular-nums text-muted">
                        이곳 사진 {ph.photoCount}장
                        {ph.minPriceKrw !== null && <> · {formatKrw(ph.minPriceKrw)}~</>}
                      </span>
                    </span>
                    <span aria-hidden className="sp-arrow shrink-0 text-body-sm text-faint">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ⑤ 촬영 팁 */}
        <section className="mt-11 border-t border-line pt-8">
          <SectionHead no={no("tip")} title="촬영 팁" />
          <p className="border-l-2 border-brand pl-4 text-body-sm leading-relaxed text-fg/85">
            {spot.tip}
          </p>
        </section>

        {/* ⑥ FAQ */}
        {faq.length > 0 && (
          <section className="mt-11 border-t border-line pt-8">
            <SectionHead no={no("faq")} title="자주 묻는 것" />
            <div className="border-t border-line-strong">
              {faq.map((f) => (
                <article key={f.q} className="border-b border-line py-4">
                  <h3 className="text-body font-semibold leading-snug tracking-tight">{f.q}</h3>
                  <p className="mt-1.5 text-body-sm leading-relaxed text-fg/85">{f.a}</p>
                  {f.href && (
                    <Link
                      href={f.href}
                      className="ed-more-arrow mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand"
                    >
                      자세히 보기 →
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {/* 이어 읽기 */}
        {relatedGuides.length > 0 && (
          <section className="mt-11 border-t border-line pt-8">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
              촬영 전에 읽어두면
            </h2>
            <ul className="mt-3 border-t border-line">
              {relatedGuides.map((g) => (
                <li key={g.slug} className="border-b border-line">
                  <Link
                    href={`/guide/${encodeURIComponent(g.slug)}`}
                    className="sp-maker group flex items-center gap-3 py-3"
                  >
                    <span className="min-w-0 flex-1 text-body-sm leading-snug tracking-tight transition-colors group-hover:text-brand">
                      {g.question}
                    </span>
                    <span aria-hidden className="sp-arrow shrink-0 text-body-sm text-faint">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

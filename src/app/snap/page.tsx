import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { StickyBack } from "@/components/editorial/StickyBack";
import { SiteFooter } from "@/components/SiteFooter";
import { SectionHead } from "@/components/editorial/SectionHead";
import { breadcrumbJsonLd, collectionJsonLd, faqJsonLd, ogImages } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { snapshotSearchablePhotos, type SearchablePhoto } from "@/lib/discovery";
import { listSpotCards, formatKrw } from "@/lib/spots";
import { listGuidePageItems } from "@/lib/guide";
import { createAdminClient } from "@/lib/supabase/admin";
import { SpotPhotoGrid } from "@/app/spots/[slug]/SpotPhotoGrid";

// 「스냅사진 촬영」 — 헤드 키워드를 정면으로 받는 지면 (seo-geo-plan §P4, 2026-10-16).
//
// "스냅사진 촬영 사이트" 로 검색하면 모카가 위에 뜨고 우리는 안 보였다. 받을 지면이 없었다 —
// /c/snap 은 광고 랜딩이라 일부러 noindex 이고, /explore 는 무드별, /spots 는 장소별이다.
// 이 지면은 그 셋을 "스냅사진 촬영" 한 질문 아래 모은다: 실제 사진·작가·가격대(DB 에서 계산),
// 종류별 사진, 장소, 그리고 이미 검수를 통과한 Q&A 원문.
//
// ⚠️ 여기 숫자는 전부 DB 에서 계산한다. "최대 규모" 같은 말은 쓰지 않는다 — 셀 수 없는 주장이다.
export const revalidate = 86400;

const TITLE = "스냅사진 촬영 — 사진 보고 작가 고르기";
const DESCRIPTION =
  "개인스냅·커플스냅·웨딩스냅. 실제로 찍힌 스냅사진을 보고 마음에 드는 사진의 작가에게 바로 문의하세요. 작가별 가격대와 촬영 장소, 자주 묻는 질문까지 사매(samae)에서.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/snap" },
  openGraph: {
    title: `${TITLE} · ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/snap`,
    type: "website",
    images: ogImages(),
  },
};

/** 종류별 묶음 — 태그는 운영자가 관리하는 카테고리(categories.tags)를 그대로 쓴다 */
const KINDS = [
  { slug: "snap", label: "개인 스냅", lead: "프로필·데일리·한복·교복, 혼자 찍는 스냅" },
  { slug: "couple", label: "커플·우정 스냅", lead: "데이트·기념일·친구와 함께" },
  { slug: "wedding", label: "웨딩 스냅", lead: "본식·야외·리마인드 웨딩" },
] as const;

/** 종류 칸을 세우는 최소 장수 — 두어 장이면 "이런 사진이 있다" 는 근거가 못 된다 */
const MIN_KIND_PHOTOS = 6;
const KIND_PHOTOS = 12;

type KindBlock = {
  slug: string;
  label: string;
  lead: string;
  count: number;
  photos: SearchablePhoto[];
  published: boolean;
};

async function loadKinds(all: SearchablePhoto[]): Promise<KindBlock[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("categories")
    .select("slug, tags, published")
    .in("slug", KINDS.map((k) => k.slug));
  const bySlug = new Map((data ?? []).map((r) => [r.slug as string, r]));
  const used = new Set<string>(); // 같은 사진이 두 칸에 겹치지 않게
  return KINDS.map((k) => {
    const row = bySlug.get(k.slug);
    const tags = new Set(((row?.tags as string[]) ?? []).map((t) => t.trim()));
    const matched = all.filter((p) => (p.mood_tags ?? []).some((t) => tags.has(t)));
    const photos = matched.filter((p) => !used.has(p.id)).slice(0, KIND_PHOTOS);
    photos.forEach((p) => used.add(p.id));
    return { ...k, count: matched.length, photos, published: !!row?.published };
  }).filter((k) => k.photos.length >= MIN_KIND_PHOTOS);
}

function topPhotographers(all: SearchablePhoto[], limit = 8) {
  const m = new Map<string, { id: string; name: string; n: number; min: number | null }>();
  for (const p of all) {
    const id = p.photographer?.id;
    if (!id) continue;
    const cur = m.get(id) ?? { id, name: p.photographer.display_name ?? "이름 비공개", n: 0, min: null };
    cur.n += 1;
    if (typeof p.price_krw === "number" && p.price_krw > 0) cur.min = cur.min === null ? p.price_krw : Math.min(cur.min, p.price_krw);
    m.set(id, cur);
  }
  const list = [...m.values()].sort((a, b) => b.n - a.n);
  return { count: list.length, top: list.slice(0, limit), prices: list.map((x) => x.min).filter((x): x is number => x !== null) };
}

export default async function SnapHubPage() {
  const all = (await snapshotSearchablePhotos()) ?? [];
  const [kinds, spots, guides] = await Promise.all([loadKinds(all), listSpotCards(6), listGuidePageItems()]);
  const makers = topPhotographers(all);
  const priceMin = makers.prices.length ? Math.min(...makers.prices) : null;
  const priceMax = makers.prices.length ? Math.max(...makers.prices) : null;

  // FAQ — (a) 이 지면에서 계산한 사실 + (b) 검수를 통과한 Q&A 원문 앞부분만. 답을 새로 지어내지 않는다.
  const faq: Array<{ q: string; a: string; href?: string }> = [
    {
      q: "사매에서 스냅사진 촬영은 어떻게 예약하나요?",
      a: "마음에 드는 사진을 고르면 그 사진을 찍은 작가에게 바로 상담을 시작할 수 있어요. 안내봇이 날짜·장소·인원을 정리해 작가에게 전달하고, 작가와 일정이 맞으면 예약 제안을 받아 결제하면 확정돼요.",
    },
  ];
  if (priceMin !== null && priceMax !== null) {
    faq.push({
      q: "스냅사진 촬영 비용은 얼마인가요?",
      a: `사매에 등록된 작가 ${makers.prices.length}명의 촬영 시작가가 ${priceMin === priceMax ? formatKrw(priceMin) : `${formatKrw(priceMin)}~${formatKrw(priceMax)}`} 선이에요. 인원·촬영 시간·보정 장수에 따라 달라지니 정확한 금액은 작가에게 문의해 주세요.`,
    });
  }
  for (const g of guides.filter((g) => g.axis === "client").slice(0, 3)) {
    faq.push({
      q: g.question,
      a: g.answer.split("\n\n").slice(0, 2).join(" ").trim(),
      href: `/guide/${encodeURIComponent(g.slug)}`,
    });
  }

  const structured = [
    collectionJsonLd({
      title: TITLE,
      description: DESCRIPTION,
      path: "/snap",
      photoIds: kinds.flatMap((k) => k.photos.map((p) => p.id)),
    }),
    breadcrumbJsonLd([
      { name: "홈", path: "/" },
      { name: "스냅사진 촬영", path: "/snap" },
    ]),
    faqJsonLd(faq.map((f) => ({ q: f.q, a: f.a }))),
  ].filter((x): x is object => !!x);

  const sections = [
    { id: "kinds", show: kinds.length > 0 },
    { id: "makers", show: makers.top.length > 0 },
    { id: "spots", show: spots.length > 0 },
    { id: "faq", show: faq.length > 0 },
  ]
    .filter((s) => s.show)
    .map((s, i) => ({ ...s, no: String(i + 1).padStart(2, "0") }));
  const no = (id: string) => sections.find((s) => s.id === id)?.no ?? "";

  return (
    <main className="min-h-dvh bg-bg font-kr">
      <JsonLd data={structured} />
      <StickyBack href="/" meta="스냅사진 촬영" maxWidth="42rem" />

      <div className="mx-auto max-w-2xl px-5 pb-24 pt-7">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">SNAP PHOTOGRAPHY</p>
          <h1 className="mt-1.5 text-[clamp(1.75rem,7vw,2.5rem)] font-extrabold leading-[1.1] tracking-[-0.035em] text-balance">
            스냅사진 촬영,
            <br />
            사진 보고 작가 고르기
          </h1>
          <p className="mt-3 text-body leading-relaxed text-fg/85">
            스냅사진은 연출보다 자연스러운 순간을 담는 촬영이에요. 사매에서는 작가 소개글 대신{" "}
            <b className="font-semibold text-fg">실제로 찍힌 사진</b>을 먼저 보고, 마음에 드는 사진의 작가에게 바로 문의할 수 있어요.
          </p>
          {all.length > 0 && (
            <p className="mt-3 text-body-sm tabular-nums text-muted">
              공개된 스냅사진 <b className="font-semibold text-fg">{all.length.toLocaleString("ko-KR")}장</b> · 작가{" "}
              <b className="font-semibold text-fg">{makers.count}명</b>
              {priceMin !== null && (
                <>
                  {" "}· 촬영 시작 <b className="font-semibold text-fg">{formatKrw(priceMin)}~</b>
                </>
              )}
            </p>
          )}
          <Link
            href="/"
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-fg px-5 text-body-sm font-bold text-bg transition-opacity hover:opacity-90"
          >
            스냅사진 전체 보기
          </Link>
        </header>

        {kinds.map((k, i) => (
          <section key={k.slug} className="mt-11 border-t border-line pt-8">
            <SectionHead
              no={i === 0 ? no("kinds") : ""}
              title={k.label}
              lead={
                <>
                  {k.lead} · 사진 <b className="font-semibold tabular-nums text-fg">{k.count}장</b>. 사진을 누르면 그걸 찍은 작가로 이어져요.
                </>
              }
            />
            <SpotPhotoGrid
              photos={k.photos.map((p) => ({ id: p.id, url: p.thumb_url ?? p.src_url }))}
              spotName={k.label}
            />
            {k.published && (
              <Link
                href={`/c/${k.slug}`}
                className="ed-more-arrow mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink"
              >
                {k.label} 더 보기 →
              </Link>
            )}
          </section>
        ))}

        {makers.top.length > 0 && (
          <section className="mt-11 border-t border-line pt-8">
            <SectionHead
              no={no("makers")}
              title="스냅 작가"
              lead={
                priceMin !== null && priceMax !== null ? (
                  <>
                    작가별 촬영 시작가는{" "}
                    <b className="font-semibold text-fg">
                      {priceMin === priceMax ? formatKrw(priceMin) : `${formatKrw(priceMin)}~${formatKrw(priceMax)}`}
                    </b>{" "}
                    선이에요. 인원·시간·보정 장수에 따라 달라져요.
                  </>
                ) : (
                  "이름을 누르면 그 작가의 포트폴리오로 이동해요."
                )
              }
            />
            <ul className="border-t border-line-strong">
              {makers.top.map((ph) => (
                <li key={ph.id} className="border-b border-line">
                  <Link href={`/photographers/${ph.id}`} className="sp-maker group flex items-center gap-3 py-3.5">
                    <span
                      aria-hidden
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-body-sm font-bold text-brand-ink"
                    >
                      {ph.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-bold tracking-tight transition-colors group-hover:text-brand">
                        {ph.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] tabular-nums text-muted">
                        스냅사진 {ph.n}장
                        {ph.min !== null && <> · {formatKrw(ph.min)}~</>}
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

        {spots.length > 0 && (
          <section className="mt-11 border-t border-line pt-8">
            <SectionHead no={no("spots")} title="스냅 촬영 장소" lead="실제로 사진이 찍힌 곳만 모았어요." />
            <ul className="border-t border-line">
              {spots.map((s) => (
                <li key={s.slug} className="border-b border-line">
                  <Link href={`/spots/${s.slug}`} className="sp-maker group flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1 text-body-sm leading-snug tracking-tight transition-colors group-hover:text-brand">
                      {s.name} 스냅 촬영
                      <span className="ml-1.5 text-[11px] tabular-nums text-muted">
                        {s.area} · {s.count}장
                      </span>
                    </span>
                    <span aria-hidden className="sp-arrow shrink-0 text-body-sm text-faint">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/spots"
              className="ed-more-arrow mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink"
            >
              촬영 장소 전체 →
            </Link>
          </section>
        )}

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
                      className="ed-more-arrow mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink"
                    >
                      자세히 보기 →
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        <SiteFooter />
      </div>
    </main>
  );
}

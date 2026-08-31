import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo";
import { listPublishedArticles, type ArticleCard } from "@/lib/articles";
import { Parallax } from "@/components/editorial/Parallax";
import { Marquee } from "@/components/editorial/Marquee";

// 아티클 목록 — 이미지가 주인공인 벤토(모자이크) 지면.
//
// 방향(레퍼런스 결합):
//   · 셀 크기를 섞은 타일 그리드 + 이미지 위 라벨   (POPEYE)
//   · 둥근 타일·필 태그의 아기자기함              (Alex Romanov)
//   · 흐르는 띠와 큰 타이포                        (ART MAGAZINE · 포스터)
//   · 스크롤 내내 뭔가 움직인다 — 패럴랙스·언베일·드리프트
//
// 스크롤 연동은 CSS `animation-timeline: view()` 를 @supports 로 감싸 쓴다.
// 미지원 브라우저(사파리)에서는 애니메이션만 빠지고 콘텐츠는 그대로 보인다.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "스냅 촬영 이야기",
  description:
    "스냅 촬영을 처음 알아보는 사람이 궁금해할 것들. 가격·준비물·장소·보정까지 사매(samae)가 정리했어요.",
  alternates: { canonical: "/articles" },
};

export default async function ArticlesIndexPage() {
  const articles = await listPublishedArticles();
  const [lead, ...rest] = articles;
  const year = new Date().getFullYear();

  return (
    <main className="min-h-dvh bg-bg font-kr">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "홈", path: "/" },
          { name: "스냅 촬영 이야기", path: "/articles" },
        ])}
      />

      {/* ── 표지 ───────────────────────────────────────────── */}
      <header className="px-4 pt-10 md:px-6 md:pt-16">
        <div className="mx-auto max-w-[1280px]">
          <div className="flex items-baseline justify-between text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            <Link href="/" className="transition-colors hover:text-brand">← samae</Link>
            <span className="tabular-nums">{String(articles.length).padStart(2, "0")} — {year}</span>
          </div>

          <h1 className="ed-mast mt-4 overflow-hidden leading-[0.82]">
            <span className="block text-[clamp(3.2rem,15vw,11rem)] font-extrabold tracking-[-0.05em]">
              STORIES
            </span>
          </h1>
        </div>
      </header>

      {/* 흐르는 띠 — 표지와 본문 사이를 잇는 러닝 헤드 */}
      <Marquee className="mt-5 border-y border-line py-2.5" speed={34}>
        {["촬영 준비", "가격", "장소", "보정", "옷", "빛", "셀렉", "계절"].map((w, i) => (
          <span key={i} className="flex items-center">
            <span className="px-5 text-[13px] font-bold uppercase tracking-[0.1em]">{w}</span>
            <span className="text-brand">✳</span>
          </span>
        ))}
      </Marquee>

      <div className="px-4 pb-24 pt-8 md:px-6">
        <div className="mx-auto max-w-[1280px]">
          {articles.length === 0 ? (
            <div className="py-24 text-center text-body-sm text-muted">아직 올라온 글이 없어요.</div>
          ) : (
            <>
              {/* ── 머리기사 — 풀블리드 이미지 위에 제목 ────── */}
              <Link
                href={`/articles/${encodeURIComponent(lead.slug)}`}
                className="ed-tile group block rounded-2xl"
              >
                <div className="ed-unveil relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-surface-2 sm:aspect-[16/9] lg:aspect-[21/9]">
                  {lead.cover_url && (
                    <Parallax speed={0.16} className="absolute inset-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={lead.cover_url}
                        alt={lead.cover_alt || lead.title}
                        className="h-full w-full object-cover"
                      />
                    </Parallax>
                  )}
                  <div className="ed-tile-veil absolute inset-0" />

                  <div className="absolute inset-x-0 bottom-0 p-5 md:p-9">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                      ✳ Featured
                    </span>
                    <h2 className="ed-drift mt-3 max-w-3xl text-[clamp(1.6rem,4.4vw,3rem)] font-extrabold leading-[1.1] tracking-[-0.035em] text-white">
                      {lead.title}
                    </h2>
                    {lead.summary && (
                      <p className="mt-2.5 hidden max-w-xl text-body-sm leading-relaxed text-white/80 sm:block">
                        {lead.summary}
                      </p>
                    )}
                    <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                      Read more
                      <span className="ed-arrow inline-block">→</span>
                    </span>
                  </div>
                </div>
              </Link>

              {/* ── 벤토 — 셀 크기를 섞는다 ─────────────────── */}
              {rest.length > 0 && (
                <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                  {rest.map((a, i) => (
                    <Tile key={a.id} a={a} n={i + 2} span={SPANS[i % SPANS.length]} />
                  ))}
                </ul>
              )}
            </>
          )}

          {/* ── 가이드로 잇기 ─────────────────────────────── */}
          <Link
            href="/guide"
            className="ed-scroll-in group mt-6 block overflow-hidden rounded-2xl bg-fg px-6 py-10 text-bg md:px-10 md:py-14"
          >
            <Marquee speed={26}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="flex items-center">
                  <span className="px-6 text-[clamp(1.4rem,3.6vw,2.4rem)] font-extrabold tracking-[-0.03em]">
                    짧게 궁금한 건 촬영 가이드에서
                  </span>
                  <span className="text-brand">→</span>
                </span>
              ))}
            </Marquee>
          </Link>
        </div>
      </div>
    </main>
  );
}

/**
 * 벤토 배치 — 6열 기준으로 셀 폭·비율을 번갈아 준다.
 * 순서대로 넓게 / 좁게 / 좁게 를 반복해 지면에 리듬을 만든다.
 */
const SPANS = [
  { col: "lg:col-span-4", ratio: "aspect-[16/10]", wide: true },
  { col: "lg:col-span-2", ratio: "aspect-[4/5]", wide: false },
  { col: "lg:col-span-2", ratio: "aspect-[4/5]", wide: false },
  { col: "lg:col-span-4", ratio: "aspect-[16/10]", wide: true },
  { col: "lg:col-span-3", ratio: "aspect-[3/2]", wide: true },
  { col: "lg:col-span-3", ratio: "aspect-[3/2]", wide: true },
];

function Tile({
  a,
  n,
  span,
}: {
  a: ArticleCard;
  n: number;
  span: { col: string; ratio: string; wide: boolean };
}) {
  return (
    <li className={`ed-scroll-in ${span.col}`}>
      <Link
        href={`/articles/${encodeURIComponent(a.slug)}`}
        className="ed-tile group block h-full rounded-2xl"
      >
        <div className={`relative w-full overflow-hidden rounded-2xl bg-surface-2 ${span.ratio}`}>
          {a.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.cover_url}
              alt={a.cover_alt || a.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-6">
              <span className="text-center text-h2 font-bold leading-snug tracking-[-0.02em] text-faint">
                {a.title}
              </span>
            </div>
          )}
          <div className="ed-tile-veil absolute inset-0" />

          <span className="absolute left-4 top-4 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-bold tabular-nums tracking-[0.1em] text-fg backdrop-blur-sm">
            .{String(n).padStart(2, "0")}
          </span>

          <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
            <h2 className="text-[clamp(1.05rem,1.5vw,1.35rem)] font-extrabold leading-[1.2] tracking-[-0.025em] text-white">
              {a.title}
            </h2>
            {/* 요약은 넓은 셀에서만. 좁은 셀에 넣으면 제목과 엉겨 읽히지 않는다. */}
            {a.summary && span.wide && (
              <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-white/75">
                {a.summary}
              </p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

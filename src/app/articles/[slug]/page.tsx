import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { Markdown } from "@/components/Markdown";
import { Reveal } from "@/components/editorial/Reveal";
import { Parallax } from "@/components/editorial/Parallax";
import { ReadingProgress } from "@/components/editorial/ReadingProgress";
import { articleJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { getPublishedArticle, listPublishedArticles, readingMinutes } from "@/lib/articles";

// 아티클 상세 — 잡지 지면.
//   · 좁은 본문 칼럼(65자 내외) + 풀블리드 커버
//   · 상단 얇은 진행 바, 본문 블록 스크롤 리빌
//   · 하단 '다음 글'은 큰 타이포 목록 (Rita 의 services 리듬)
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = await getPublishedArticle(slug);
  if (!a) return {};
  const path = `/articles/${encodeURIComponent(a.slug)}`;
  return {
    title: a.title,
    description: a.summary,
    alternates: { canonical: path },
    openGraph: {
      title: `${a.title} · ${SITE_NAME}`,
      description: a.summary,
      url: `${SITE_URL}${path}`,
      type: "article",
      ...(a.cover_url ? { images: [{ url: a.cover_url }] } : {}),
    },
  };
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = await getPublishedArticle(slug);
  if (!a) notFound();

  const path = `/articles/${encodeURIComponent(a.slug)}`;
  const others = (await listPublishedArticles()).filter((x) => x.slug !== a.slug).slice(0, 3);
  const dateText = a.published_at
    ? new Date(a.published_at).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <main className="min-h-dvh bg-bg font-kr">
      <ReadingProgress />
      <JsonLd
        data={[
          articleJsonLd({
            slug: a.slug,
            title: a.title,
            summary: a.summary,
            coverUrl: a.cover_url,
            publishedAt: a.published_at,
            updatedAt: a.updated_at,
          }),
          breadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "스냅 촬영 이야기", path: "/articles" },
            { name: a.title, path },
          ]),
        ]}
      />

      {/* ── 표제 + 커버 — 제목을 이미지 위에 얹는다 ────────── */}
      {a.cover_url ? (
        <section className="px-4 pt-6 md:px-6 md:pt-8">
          <div className="mx-auto max-w-[1280px]">
            <Link
              href="/articles"
              className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted transition-colors hover:text-brand"
            >
              ← Stories
            </Link>
            <div className="ed-unveil relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-surface-2 sm:aspect-[16/9] lg:aspect-[2/1]">
              <Parallax speed={0.16} className="absolute inset-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.cover_url}
                  alt={a.cover_alt || a.title}
                  className="h-full w-full object-cover"
                />
              </Parallax>
              <div className="ed-tile-veil absolute inset-0" />
              <div className="absolute inset-x-0 bottom-0 p-5 md:p-10">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/75">
                  <span className="rounded-full bg-brand px-2.5 py-1 text-white">Article</span>
                  {dateText && <span className="tabular-nums">{dateText}</span>}
                  <span>·</span>
                  <span className="tabular-nums">{readingMinutes(a.body_md)} min read</span>
                </div>
                <h1 className="ed-drift mt-3 max-w-4xl text-[clamp(1.9rem,5.2vw,3.6rem)] font-extrabold leading-[1.08] tracking-[-0.04em] text-white">
                  {a.title}
                </h1>
              </div>
            </div>
            {a.summary && (
              <p className="mx-auto mt-8 max-w-[760px] text-[clamp(1rem,1.6vw,1.15rem)] leading-relaxed text-muted">
                {a.summary}
              </p>
            )}
          </div>
        </section>
      ) : (
        <header className="px-4 pb-2 pt-10 md:px-6 md:pt-14">
          <div className="mx-auto max-w-[760px]">
            <Link
              href="/articles"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted transition-colors hover:text-brand"
            >
              ← Stories
            </Link>
            <div className="mt-8 flex flex-wrap items-center gap-x-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
              <span className="rounded-full bg-brand px-2.5 py-1 text-white">Article</span>
              {dateText && <span className="tabular-nums">{dateText}</span>}
              <span>·</span>
              <span className="tabular-nums">{readingMinutes(a.body_md)} min read</span>
            </div>
            <h1 className="ed-mast mt-4 overflow-hidden">
              <span className="block text-[clamp(2rem,6.4vw,3.4rem)] font-extrabold leading-[1.08] tracking-[-0.04em]">
                {a.title}
              </span>
            </h1>
            {a.summary && (
              <p className="mt-5 border-l-2 border-brand pl-4 text-body leading-relaxed text-muted">
                {a.summary}
              </p>
            )}
          </div>
        </header>
      )}

      {/* ── 본문 ───────────────────────────────────────────── */}
      <div className="mt-14 px-4 md:px-6">
        {/* 본문은 리빌하지 않는다. 긴 글을 통째로 페이드시키면 스크롤 도중 글이
            흐려 보여 읽기를 방해한다 — 리빌은 CTA·다음글 같은 '덩어리'에만 쓴다. */}
        <article className="ed-body mx-auto max-w-[760px]">
          <Markdown source={a.body_md} />
        </article>
      </div>

      {/* ── 전환 ───────────────────────────────────────────── */}
      <div className="mt-20 px-5 md:px-8">
        <div className="mx-auto max-w-[760px]">
          <Reveal>
            <div className="border-y border-line py-10 text-center">
              <p className="mx-auto max-w-sm text-body leading-relaxed">
                마음에 든 사진이 있으면
                <br />
                <b className="font-semibold">그 사진을 찍은 작가</b>에게 바로 물어볼 수 있어요.
              </p>
              <Link
                href="/"
                className="group mt-6 inline-flex items-center gap-2 rounded-full bg-fg px-6 py-3 text-body-sm font-bold text-bg transition-opacity hover:opacity-90"
              >
                사진 둘러보기
                <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </div>

      {/* ── 다음 글 ────────────────────────────────────────── */}
      {others.length > 0 && (
        <section className="mt-16 px-5 pb-24 md:px-8">
          <div className="mx-auto max-w-[1200px]">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
              More stories
            </h2>
            <ul className="mt-4 border-t border-line">
              {others.map((o, i) => (
                <li key={o.id} className="border-b border-line">
                  <Reveal delay={i * 70}>
                    <Link
                      href={`/articles/${encodeURIComponent(o.slug)}`}
                      className="ed-cell group flex items-baseline gap-4 py-5"
                    >
                      <span className="ed-num font-display text-body-sm italic text-faint tabular-nums">
                        .{String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-h2 font-bold leading-snug tracking-[-0.02em]">
                          {o.title}
                        </span>
                        {o.summary && (
                          <span className="mt-1 line-clamp-1 block text-body-sm text-muted">
                            {o.summary}
                          </span>
                        )}
                      </span>
                      <span className="ed-arrow shrink-0 text-body-sm">→</span>
                    </Link>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}

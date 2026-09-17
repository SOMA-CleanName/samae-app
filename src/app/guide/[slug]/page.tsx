import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { StickyBack } from "@/components/editorial/StickyBack";
import { SiteFooter } from "@/components/SiteFooter";
import { faqJsonLd, breadcrumbJsonLd, ogImages } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { findGuideItem, listGuidePageItems } from "@/lib/guide";

// 가이드 개별 글. 본문이 충분한 항목만 여기로 온다(GUIDE_PAGE_ITEMS) —
// 짧은 답은 허브에만 두고 단독 URL 을 주지 않는다. thin content 를 만들지 않기 위해서다.

// Next.js 16: 동적 라우트 param 은 자동 디코딩되지 않는다. 한글 슬러그라 findGuideItem 이 직접 디코딩한다.
//
// 🔴 **여기서 encodeURIComponent 를 하면 안 된다.** generateStaticParams 가 돌려주는 값은
//    **원본(디코딩된) 슬러그**여야 하고, URL 로 만드는 인코딩은 Next 가 한다. 미리 인코딩해서
//    넘기면 **두 번 인코딩된 경로**로 프리렌더된다(`%EC%B9%9C…` → `%25EC%25B9%259C…`).
//
//    그 결과가 고약했다 — 빌드 때 그 이중 인코딩 값으로 findGuideItem 이 돌고, 한 번만
//    디코딩해서는 어느 슬러그와도 안 맞으니 notFound() 가 **404 페이지로 구워진다.**
//    정작 진짜 주소(`/guide/%EC%B9%9C…`)는 프리렌더 목록에 없다.
//
//    실측 2026-09-17 — /guide 허브가 거는 **14개 링크가 전부 404**였다. sitemap 에도
//    그대로 실려 구글이 방금 그 14개를 긁어갔고, llms.txt 는 AI 에게 `/guide/{slug}` 를
//    가장 먼저 읽으라고 안내하고 있었다. 빌드도 통과하고 에러도 안 나서 안 보였다.
//
//    같은 라우트인 /spots/[slug] 는 원본 슬러그를 그대로 돌려줘 멀쩡했고(비교군),
//    /articles/[slug] 는 generateStaticParams 자체가 없어 동적 렌더라 멀쩡했다.
export async function generateStaticParams() {
  return (await listGuidePageItems()).map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await findGuideItem(slug);
  if (!item) return {};
  // 본문 앞부분을 설명으로. 검색 결과에 그대로 노출되는 자리라 문장 중간에서 자르지 않는다.
  const flat = item.answer.replace(/\s+/g, " ").trim();
  const cut = flat.slice(0, 150);
  const description = flat.length > 150 ? `${cut.slice(0, cut.lastIndexOf(" ") || 150)}…` : flat;
  const path = `/guide/${encodeURIComponent(item.slug)}`;
  return {
    title: item.question,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${item.question} · ${SITE_NAME}`,
      description,
      url: `${SITE_URL}${path}`,
      type: "article",
      // openGraph 를 직접 쓰면 루트 opengraph-image 를 못 물려받는다
      images: ogImages(),
    },
  };
}

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await findGuideItem(slug);
  if (!item) notFound();

  const path = `/guide/${encodeURIComponent(item.slug)}`;
  // 한 문항짜리 FAQPage — AI 가 이 페이지를 "질문에 대한 답"으로 인식하게 한다.
  const faq = faqJsonLd([{ q: item.question, a: item.answer }]);
  const breadcrumb = breadcrumbJsonLd([
    { name: "홈", path: "/" },
    { name: "촬영 가이드", path: "/guide" },
    { name: item.question, path },
  ]);

  const related = (await listGuidePageItems()).filter(
    (g) => g.axis === item.axis && g.slug !== item.slug
  ).slice(0, 4);

  return (
    <main className="min-h-dvh bg-bg font-kr">
      {faq && <JsonLd data={faq} />}
      <JsonLd data={breadcrumb} />

      <StickyBack href="/guide" meta={item.axisLabel} maxWidth="42rem" />

      <div className="mx-auto max-w-2xl px-5 pb-24 pt-8">
      <p className="text-xs font-semibold tracking-tight text-muted">{item.axisLabel}</p>
      <h1 className="mt-1.5 text-2xl font-bold leading-snug tracking-tight">{item.question}</h1>

      <div className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-fg/85">
        {item.answer}
      </div>

      <div className="mt-10 rounded-2xl bg-fg/[0.04] px-5 py-5">
        <p className="text-sm leading-relaxed text-fg/85">
          마음에 든 사진이 있다면 그 사진을 찍은 작가에게 바로 물어볼 수 있어요.
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          사진 둘러보기
        </Link>
      </div>

      {related.length > 0 && (
        <section className="mt-12 border-t border-line pt-6">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
            함께 보면 좋은 글
          </h2>
          {/* 줄마다 구획선 — 제목만 나열하면 어디까지가 한 항목인지 안 보인다 */}
          <ul className="mt-3 border-t border-line">
            {related.map((g) => (
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

      {/* 목록(/guide)엔 있고 문답 낱개엔 없었다. 검색으로 바로 들어오는 지면이라
          여기서도 사업자 정보·약관에 닿아야 한다. */}
      <SiteFooter />
      </div>
    </main>
  );
}

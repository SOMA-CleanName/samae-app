import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@/components/user/icons";
import { JsonLd } from "@/components/JsonLd";
import { faqJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { findGuideItem, GUIDE_PAGE_ITEMS } from "@/lib/guide-data";

// 가이드 개별 글. 본문이 충분한 항목만 여기로 온다(GUIDE_PAGE_ITEMS) —
// 짧은 답은 허브에만 두고 단독 URL 을 주지 않는다. thin content 를 만들지 않기 위해서다.

// Next.js 16: 동적 라우트 param 은 자동 디코딩되지 않는다. 한글 슬러그라 findGuideItem 이 직접 디코딩한다.
export async function generateStaticParams() {
  return GUIDE_PAGE_ITEMS.map((g) => ({ slug: encodeURIComponent(g.slug) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = findGuideItem(slug);
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
    },
  };
}

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = findGuideItem(slug);
  if (!item) notFound();

  const path = `/guide/${encodeURIComponent(item.slug)}`;
  // 한 문항짜리 FAQPage — AI 가 이 페이지를 "질문에 대한 답"으로 인식하게 한다.
  const faq = faqJsonLd([{ q: item.question, a: item.answer }]);
  const breadcrumb = breadcrumbJsonLd([
    { name: "홈", path: "/" },
    { name: "촬영 가이드", path: "/guide" },
    { name: item.question, path },
  ]);

  const related = GUIDE_PAGE_ITEMS.filter(
    (g) => g.axis === item.axis && g.slug !== item.slug
  ).slice(0, 4);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 font-kr">
      {faq && <JsonLd data={faq} />}
      <JsonLd data={breadcrumb} />

      <Link
        href="/guide"
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon className="h-4 w-4" /> 촬영 가이드
      </Link>

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
        <section className="mt-10">
          <h2 className="text-sm font-semibold tracking-tight text-muted">함께 보면 좋은 글</h2>
          <ul className="mt-3 space-y-2">
            {related.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/guide/${encodeURIComponent(g.slug)}`}
                  className="text-sm leading-snug text-fg/85 transition-colors hover:text-fg"
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

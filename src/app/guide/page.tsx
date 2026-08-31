import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/user/icons";
import { JsonLd } from "@/components/JsonLd";
import { faqJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { PUBLISHED_GUIDE_ITEMS, GUIDE_PAGE_ITEMS, AXIS_ORDER } from "@/lib/guide-data";

// 스냅 촬영 가이드 허브.
//
// 왜 허브에 답을 전부 펼쳐 두나:
//   ① FAQPage 구조화데이터는 **AI 답변 인용률이 가장 높은 형식**이다. 한 페이지에 모을수록 강해진다
//   ② 짧은 답(80자 이하가 11편)은 개별 페이지로 만들면 thin content 가 된다.
//      허브에선 가치가 있지만 단독 페이지로는 감점이라, 개별 페이지는 긴 것만 만든다(GUIDE_PAGE_ITEMS).
export const metadata: Metadata = {
  title: "스냅 촬영 가이드 — 자주 묻는 것들",
  description:
    "스냅 촬영을 준비하면서 자주 막히는 것들. 옷 색, 포즈, 레퍼런스, 비 오는 날, 보정본까지 — 사매(samae)가 정리했어요.",
  alternates: { canonical: "/guide" },
};

export default function GuideHubPage() {
  const items = PUBLISHED_GUIDE_ITEMS;
  const pageSlugs = new Set(GUIDE_PAGE_ITEMS.map((g) => g.slug));

  const faq = faqJsonLd(items.map((g) => ({ q: g.question, a: g.answer })));
  const breadcrumb = breadcrumbJsonLd([
    { name: "홈", path: "/" },
    { name: "촬영 가이드", path: "/guide" },
  ]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 font-kr">
      {faq && <JsonLd data={faq} />}
      <JsonLd data={breadcrumb} />

      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon className="h-4 w-4" /> 홈으로
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">스냅 촬영 가이드</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        촬영을 준비하면서 자주 막히는 것들을 모았어요. 사진이 쌓이면서 보이는 것들을 하나씩 적어둡니다.
      </p>

      {items.length === 0 ? (
        <p className="mt-10 text-sm text-muted">아직 공개된 글이 없어요.</p>
      ) : (
        <div className="mt-9 space-y-10">
          {AXIS_ORDER.map((axis) => {
            const group = items.filter((g) => g.axis === axis);
            if (group.length === 0) return null;
            return (
              <section key={axis}>
                <h2 className="text-sm font-semibold tracking-tight text-muted">
                  {group[0].axisLabel}
                </h2>
                <div className="mt-3 space-y-6">
                  {group.map((g) => (
                    <article key={g.slug}>
                      <h3 className="text-base font-semibold leading-snug tracking-tight">
                        {pageSlugs.has(g.slug) ? (
                          <Link
                            href={`/guide/${encodeURIComponent(g.slug)}`}
                            className="transition-colors hover:text-muted"
                          >
                            {g.question}
                          </Link>
                        ) : (
                          g.question
                        )}
                      </h3>
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-fg/85">
                        {g.answer}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

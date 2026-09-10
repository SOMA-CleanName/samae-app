import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { StickyBack } from "@/components/editorial/StickyBack";
import { SiteFooter } from "@/components/SiteFooter";
import { ChannelCard } from "@/components/ChannelCard";
import { Masthead } from "@/components/editorial/Masthead";
import { faqJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { PUBLISHED_GUIDE_ITEMS, GUIDE_PAGE_ITEMS, AXIS_ORDER } from "@/lib/guide-data";

// 스냅 촬영 가이드 허브.
//
// 왜 허브에 답을 전부 펼쳐 두나:
//   ① FAQPage 구조화데이터는 **AI 답변 인용률이 가장 높은 형식**이다. 한 페이지에 모을수록 강해진다
//   ② 짧은 답(80자 이하가 11편)은 개별 페이지로 만들면 thin content 가 된다.
//      허브에선 가치가 있지만 단독 페이지로는 감점이라, 개별 페이지는 긴 것만 만든다(GUIDE_PAGE_ITEMS).
//
// 다만 '전부 펼쳐 둔다'를 화면에서도 그대로 하면 답 열네 개가 경계 없이 이어져
// 어디서 한 문답이 끝나는지 안 보였다. 그래서 화면에서는 **질문 목록**으로 접는다.
//   · 접혀 있어도 답은 DOM 에 그대로 있다 — FAQPage 구조화데이터도 크롤러도 영향 없음
//   · <details>/<summary> 라 JS 없이도 열린다. 키보드·스크린리더도 기본 동작 그대로
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

  // 빈 축은 목차에도 본문에도 안 나온다 — 눌렀는데 아무 데도 안 가는 칩을 만들지 않는다.
  const groups = AXIS_ORDER.map((axis) => ({
    axis,
    entries: items.filter((g) => g.axis === axis),
  })).filter((g) => g.entries.length > 0);

  return (
    <main className="min-h-dvh bg-bg font-kr">
      {faq && <JsonLd data={faq} />}
      <JsonLd data={breadcrumb} />

      <StickyBack href="/" meta="Q & A" maxWidth="720px" />

      <div className="mx-auto w-full max-w-[720px] px-5 pb-24 pt-6">
        <Masthead
          word="Q & A"
          size="compact"
          lead="촬영을 준비하면서 자주 막히는 것들. 질문을 누르면 답이 열려요."
          meta={<span className="tabular-nums">문답 {items.length}개</span>}
        />

        {groups.length === 0 ? (
          <p className="py-24 text-center text-body-sm text-muted">아직 공개된 글이 없어요.</p>
        ) : (
          <>
            {/* 목차 — 어느 축에 몇 개인지. 길어진 지면에서 원하는 데로 바로 뛴다. */}
            <nav aria-label="분류" className="rail -mx-5 mt-7 flex gap-2 px-5 pb-1">
              {groups.map(({ axis, entries }) => (
                <a
                  key={axis}
                  href={`#axis-${axis}`}
                  className="gd-chip flex shrink-0 items-baseline gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-[12px] font-semibold tracking-tight"
                >
                  {entries[0].axisLabel}
                  <span className="text-[10px] tabular-nums text-faint">{entries.length}</span>
                </a>
              ))}
            </nav>

            <div className="mt-9 space-y-11">
              {groups.map(({ axis, entries }, gi) => (
                <section key={axis} id={`axis-${axis}`} className="scroll-mt-16">
                  {/* 축 머리 — 브랜드 규칙선 + 번호. 아티클 지면의 SectionHead 와 같은 리듬. */}
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-body-sm italic tabular-nums text-brand">
                      {String(gi + 1).padStart(2, "0")}
                    </span>
                    <h2 className="text-title font-bold tracking-tight">
                      {entries[0].axisLabel}
                    </h2>
                    <span className="ml-auto text-[11px] tabular-nums text-faint">
                      {entries.length}
                    </span>
                  </div>

                  <div className="mt-3 border-t border-line-strong">
                    {entries.map((g, i) => (
                      // 한 문답 = 한 줄. 열면 그 자리에서 답이 펼쳐진다.
                      // 첫 축의 첫 항목만 열어 둔다 — 전부 닫혀 있으면 눌러야 한다는 걸 모른다.
                      // name(배타 아코디언)은 안 쓴다. 두 답을 나란히 놓고 보는 걸 막을 이유가 없다.
                      <details
                        key={g.slug}
                        open={gi === 0 && i === 0}
                        className="gd-item border-b border-line"
                      >
                        <summary className="gd-q flex cursor-pointer list-none items-start gap-3 py-4">
                          <span className="min-w-0 flex-1 text-body font-semibold leading-snug tracking-tight">
                            {g.question}
                          </span>
                          <span aria-hidden className="gd-mark mt-0.5 shrink-0 text-muted">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                            >
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                          </span>
                        </summary>

                        <div className="gd-a pb-5 pr-7">
                          <p className="whitespace-pre-line border-l-2 border-brand-soft pl-4 text-body-sm leading-relaxed text-fg/85">
                            {g.answer}
                          </p>
                          {pageSlugs.has(g.slug) && (
                            <Link
                              href={`/guide/${encodeURIComponent(g.slug)}`}
                              className="ed-more-arrow mt-3 ml-4 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand"
                            >
                              따로 보기 →
                            </Link>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}

        <ChannelCard />

        <SiteFooter />
      </div>
    </main>
  );
}

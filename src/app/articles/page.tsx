import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo";
import { countArticleViews, listPublishedArticles } from "@/lib/articles";
import { Masthead } from "@/components/editorial/Masthead";
import { StickyBack } from "@/components/editorial/StickyBack";
import { SiteFooter } from "@/components/SiteFooter";
import { ArticleNotice, ArticleRows } from "@/components/editorial/ArticleTiers";

/*
  아티클 색인.

  전에는 여기도 탐색 탭과 똑같은 매거진 지면이었다 — 큰 표제, 흐르는 띠, 풀블리드
  머리기사, 벤토 격자. 그런데 지금 그 역할은 탐색 탭이 한다. 여기는 그 지면의
  '전체 보기'를 눌러 들어오는 곳이라, 표지를 한 번 더 보여주면 헛걸음이 된다.

  그래서 색인으로 되돌렸다 — 전부, 같은 밀도로, 빨리 훑히게.
  카드 모양은 탐색과 같은 컴포넌트를 쓴다. 따로 그리면 같은 글이 두 지면에서 다르게 보인다.
*/
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "스냅 촬영 이야기",
  description:
    "스냅 촬영을 처음 알아보는 사람이 궁금해할 것들. 가격·준비물·장소·보정까지 사매(samae)가 정리했어요.",
  alternates: { canonical: "/articles" },
};

export default async function ArticlesIndexPage() {
  const [articles, views] = await Promise.all([
    listPublishedArticles(),
    countArticleViews().catch(() => ({}) as Record<string, number>),
  ]);

  // 공지 — sort_order 1위 글(입문 글)을 색인 위에 따로 세운다. 어드민이 순서로 제어.
  const notice = articles[0];
  const rest = articles.slice(1);

  return (
    <main className="min-h-dvh bg-bg font-kr">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "홈", path: "/" },
          { name: "스냅 촬영 이야기", path: "/articles" },
        ])}
      />

      <StickyBack href="/explore" meta="Articles" />

      <div className="mx-auto w-full max-w-[880px] px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
        <Masthead
          word="ARTICLES"
          size="compact"
          // 글 개수는 발행 정보라 표제 위 오른쪽에 붙인다(왼쪽은 비워 둔다).
          meta={
            articles.length > 0 ? (
              <span className="ml-auto tabular-nums">글 {articles.length}편</span>
            ) : undefined
          }
        />

        {articles.length === 0 ? (
          <p className="py-24 text-center text-body-sm text-muted">아직 올라온 글이 없어요.</p>
        ) : (
          <>
            <ArticleNotice article={notice} views={views} />
            <ArticleRows articles={rest} views={views} />
          </>
        )}

        <SiteFooter />
      </div>
    </main>
  );
}

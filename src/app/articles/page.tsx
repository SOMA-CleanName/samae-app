import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo";
import { listPublishedArticles } from "@/lib/articles";
import { Masthead } from "@/components/editorial/Masthead";
import { StickyBack } from "@/components/editorial/StickyBack";
import { ArticleRows } from "@/components/editorial/ArticleTiers";

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
  const articles = await listPublishedArticles();

  return (
    <main className="min-h-dvh bg-bg font-kr">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "홈", path: "/" },
          { name: "스냅 촬영 이야기", path: "/articles" },
        ])}
      />

      <StickyBack href="/explore" meta="All stories" />

      <div className="mx-auto w-full max-w-[880px] px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
        <Masthead
          word="ALL STORIES"
          size="compact"
          lead="가격이 왜 다른지, 뭘 입어야 하는지, 어디서 찍는지."
          // meta 는 justify-between 이라 조각을 여럿 넘기면 양끝으로 벌어진다. 한 덩어리로.
          meta={
            articles.length > 0 ? (
              <span className="tabular-nums">글 {articles.length}편</span>
            ) : undefined
          }
        />

        {articles.length === 0 ? (
          <p className="py-24 text-center text-body-sm text-muted">아직 올라온 글이 없어요.</p>
        ) : (
          <ArticleRows articles={articles} />
        )}
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { getCurrentUser } from "@/lib/auth";
import { toProfileMe } from "@/lib/profile-me";
import { ProfileButton } from "@/components/user/ProfileButton";
import { memoTtl } from "@/lib/server-memo";
import { ScrollMemory } from "@/components/user/ScrollMemory";
import { MpTrackOnce } from "@/components/MpTrackOnce";
import { ExploreRunningHead, type RunningSection } from "./ExploreRunningHead";
import { SpotsRail } from "./SpotsRail";
import { ArticleDeck } from "./ArticleDeck";
import { ArticleList } from "@/components/editorial/ArticleTiers";
import { PhotoFeature } from "./PhotoFeature";
import { listFeaturedPhotos, type FeaturedPhoto } from "@/lib/explore-db";
import { listPublishedArticles, type ArticleCard } from "@/lib/articles";
import { listSpotCards, type SpotCard } from "@/lib/spots";
import { GUIDE_PAGE_ITEMS } from "@/lib/guide-data";
import { Masthead } from "@/components/editorial/Masthead";
import { SectionHead } from "@/components/editorial/SectionHead";
import { IndexList } from "@/components/editorial/IndexList";
import { Marquee } from "@/components/editorial/Marquee";
import { SiteFooter } from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

/*
  ⚠️ 이게 없으면 이 지면은 **홈의 복제본으로 신고된다.**

  루트 layout.tsx 이 `alternates: { canonical: "/" }` 를 들고 있고 자식이 그걸 상속한다.
  그래서 /explore 가 `<link rel="canonical" href="https://samae.ai">` 를 뱉고 있었다 —
  색인에서 빠지는 게 아니라 "나는 홈과 같은 페이지"라고 구글에 말하는 상태다.
  제목·설명도 홈과 문자 단위로 똑같았다.

  (같은 사고가 /explore/{slug} 19개에도 있었다 — lib/seo.ts 의 exploreCategoryMetadata 주석 참고.
   그때는 하위 페이지만 고치고 이 인덱스를 빠뜨렸다.)
*/
export const metadata: Metadata = {
  title: "스냅 촬영 읽을거리와 장소",
  description:
    "가격이 왜 다른지, 뭘 입어야 하는지, 어디서 찍는지. 스냅 촬영을 처음 알아보는 사람이 궁금해할 것들을 사매가 아티클·촬영 장소·자주 묻는 질문으로 정리했어요.",
  keywords: ["스냅 촬영", "스냅 가격", "촬영 준비물", "촬영 장소", "스냅 매거진"],
  alternates: { canonical: "/explore" },
  openGraph: {
    title: "스냅 촬영 읽을거리와 장소 · samae",
    description: "가격이 왜 다른지, 뭘 입어야 하는지, 어디서 찍는지.",
    url: `${SITE_URL}/explore`,
    type: "website",
  },
};

/*
  매거진 탭.

  하단 내비에서 '탐색'이라 부르고 아이콘도 돋보기였다. 둘 다 이 지면이 하는 일과
  달랐다 — 여기엔 검색창이 없고(진짜 검색은 홈 상단 SearchDock 이다), 사진을
  훑는 일(무드 고르기·전체 피드)도 홈이 맡는다.
  이름과 아이콘을 지면에 맞췄다(마스트헤드가 MAGAZINE 이다).

  ⚠️ 취향 테스트(/explore/quiz)는 예외다 — 경로상 여기 아래에 있고, 하단 내비의
     힌트 말풍선도 이 탭을 가리킨다. 한때 이 주석이 "취향 테스트도 홈이 맡는다"고
     적혀 있었는데 코드와 반대였다(홈 바로가기의 '취향' 칩도 /explore/quiz 로 간다).
     진입점이 둘(홈 바로가기 · 이 탭)이고 실체는 여기 하나다.
  여기는 읽을 것과 알 것 — 아티클·화보·촬영 장소·자주 묻는 것.

  한때 여기 '인기 사진'이 격자로도 슬라이드로도 있었다. 형식 문제가 아니었다 —
  많이 열린 사진을 늘어놓는 건 아무 약속도 안 하고, 사진 훑기는 홈이 이미 한다.
  같은 인기 신호를 쓰되 **전면 화보 한 장 + 촬영지**로 바꿨다.
  (잠깐 작가 화보로 만들었다가 되돌렸다. 사매는 개별 작가를 띄우는 서비스가 아니다.)

  스냅 촬영은 처음 알아보는 사람이 가격도 준비물도 모르는 채 시작하는데,
  그 정보 비대칭을 메우는 게 이 지면의 일이다.
*/
export default async function ExplorePage() {
  const [me, articles, spots, featured] = await Promise.all([
    getCurrentUser(),
    memoTtl("explore:articles", 60_000, () => listPublishedArticles()).catch(
      () => [] as ArticleCard[]
    ),
    // 레일에 다섯 장만 세운다. 나머지는 끝에서 당겨 넘어가는 전체보기가 받는다.
    memoTtl("explore:spots", 60_000, () => listSpotCards(50)).catch(() => [] as SpotCard[]),
    // 화보에 실을 사진 넷(게시물 단위). 좁은 화면은 3장, 넓으면 2×2 로 넷을 편다.
    memoTtl("explore:featured", 60_000, () => listFeaturedPhotos(4, 30)).catch(
      () => [] as FeaturedPhoto[]
    ),
  ]);

  const guidePeek = GUIDE_PAGE_ITEMS.slice(0, 6);

  /*
    레일에 세우는 장소 수. 나머지는 끝에서 당겨 넘어가는 전체보기가 받는다.

    이 상수는 여기(서버)에 둔다. SpotsRail 은 "use client" 라, 거기서 export 한 값을
    서버 컴포넌트가 import 하면 숫자가 아니라 클라이언트 참조가 넘어온다 —
    slice(0, 그것) 이 NaN 이 되면서 레일이 통째로 비었다.
  */
  const SPOTS_RAIL_MAX = 5;

  /*
    아티클은 두 단이다.
      덱(8)   — 큰 카드. 옆으로 넘겨 본다
      목록(10)— 글자만. 찾아 들어가는 자리

    중간에 '작은 사진 + 제목' 가로 카드 단이 하나 더 있었는데 걷어냈다.
    덱과 목록 사이에서 어느 쪽도 아닌 애매한 무게였고, 큰 카드로 넘겨 볼 수 있는 걸
    굳이 작게 줄여 다시 보여줄 이유가 없었다. 그 몫은 덱이 받는다(3 → 8장).
    그래도 남는 글은 아티클 지면이 받는다.
  */
  const DECK_N = 8;
  const LIST_N = 10;
  const deck = articles.slice(0, DECK_N);
  const list = articles.slice(DECK_N, DECK_N + LIST_N);
  const restCount = Math.max(0, articles.length - (DECK_N + LIST_N));

  const sections: RunningSection[] = [
    { id: "sec-articles", label: "ARTICLES", show: articles.length > 0 },
    { id: "sec-featured", label: "TREND", show: featured.length > 0 },
    { id: "sec-spots", label: "SPOTS", show: spots.length > 0 },
    { id: "sec-guide", label: "Q&A", show: guidePeek.length > 0 },
  ]
    .filter((d) => d.show)
    .map(({ id, label }) => ({ id, label }));

  const empty = sections.length === 0;

  /*
    이 지면이 무엇의 목록인지 기계에 알려 준다.
    AI 답변이 인용하는 건 사진이 아니라 글이라, 실린 아티클을 ItemList 로 편다.
    (개별 글의 Article 스키마는 /articles/{slug} 가 각자 들고 있다)
  */
  const articleList = itemListJsonLd(
    "스냅 촬영 읽을거리",
    [...deck, ...list].map((a) => ({
      name: a.title,
      path: `/articles/${encodeURIComponent(a.slug)}`,
    }))
  );

  return (
    <main className="min-h-dvh bg-bg font-kr">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "홈", path: "/" },
          { name: "매거진", path: "/explore" },
        ])}
      />
      {articleList && <JsonLd data={articleList} />}
      <MpTrackOnce
        event="View Explore Feed"
        props={{ article_count: articles.length, spot_count: spots.length }}
      />
      <ScrollMemory />

      {/* ── 표제 ─────────────────────────────────────────────── */}
      {/*
        표제를 최대한 위로 올린다 — action 행을 표제 위에 따로 세우면 그만큼
        빈 띠가 생겨서, 계정 버튼은 표제와 같은 높이의 오른쪽에 겹쳐 세운다.
        (계정 진입 자체는 홈·카테고리 지면과 같은 장치 — 읽다 보면 오래 머무는
         지면이라 로그아웃 한 번 하려고 홈으로 돌아가지 않게)
      */}
      <div className="relative mx-auto w-full max-w-[1280px] px-4 pt-2 sm:px-6 sm:pt-3">
        <div className="absolute right-4 top-2 z-10 sm:right-6 sm:top-3">
          <ProfileButton
            loggedIn={!!me}
            avatarUrl={me?.avatarUrl ?? null}
            me={toProfileMe(me)}
          />
        </div>
        <Masthead word="MAGAZINE" size="compact" />
      </div>

      {/*
        러닝 밴드.
        전에는 아티클 제목과 장소 이름이 한글로 흘렀는데, 긴 문장이 지나가니
        읽으라는 건지 장식인지 애매했다. 잡지 러닝헤드는 읽는 물건이 아니라
        지면을 묶는 띠라서, 짧은 라틴 대문자로 바꿨다.
      */}
      <Marquee className="mt-5 border-y border-line py-2" speed={40}>
        {["ARTICLES", "TREND", "SPOTS", "Q & A"].map((w, i) => (
          <span key={i} className="flex items-center">
            <span className="px-6 text-[11px] font-bold uppercase tracking-[0.28em]">{w}</span>
            <span className="text-brand">✳︎</span>
          </span>
        ))}
      </Marquee>

      {/* 러닝 헤드 — 스크롤해서 상단에 닿으면 나타난다.
          (sticky 가 지면 전체 구간 동안 고정되려면 래퍼로 감싸지 말 것) */}
      <ExploreRunningHead sections={sections} />

      <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-7 sm:px-6">
        {empty ? (
          <p className="py-20 text-center text-body-sm text-muted">
            준비 중이에요. 곧 읽을거리를 채워 드릴게요.
          </p>
        ) : (
          <>
            {/* ── ARTICLES ─────────────────────────────────── */}
            {articles.length > 0 && (
              <section id="sec-articles" data-pid="sec-articles" className="scroll-mt-24">
                <SectionHead title="ARTICLES" more="/articles" />

                {/*
                  카드를 한 장씩 넘겨 본다.
                  격자로 여러 장을 깔았더니 카드마다 자리가 좁아 제목·요약이 다 눌렸다.
                */}
                <ArticleDeck articles={deck} />

                {list.length > 0 && <ArticleList articles={list} />}

                {/* 여기서도 다 못 실은 게 남았을 때만 지면을 넘긴다 */}
                {restCount > 0 && (
                  <Link
                    href="/articles"
                    className="ed-more mt-4 flex w-full items-center justify-center gap-1.5 rounded-full border border-line bg-surface py-2.5 text-body-sm font-semibold"
                  >
                    글 {restCount}편 더 보기
                    <span aria-hidden className="ed-more-arrow text-[11px]">
                      →
                    </span>
                  </Link>
                )}
              </section>
            )}

            {/* ── TREND ────────────────────────────────────── */}
            {featured.length > 0 && (
              <section id="sec-featured" data-pid="sec-featured" className="mt-20 scroll-mt-24">
                <SectionHead title="TREND" />
                <PhotoFeature photos={featured} />
              </section>
            )}

            {/* ── SPOTS ────────────────────────────────────── */}
            {spots.length > 0 && (
              <section id="sec-spots" data-pid="sec-spots" className="mt-20 scroll-mt-24">
                <SectionHead title="SPOTS" more="/spots" />
                <SpotsRail spots={spots.slice(0, SPOTS_RAIL_MAX)} total={spots.length} />
              </section>
            )}

            {/* ── Q&A ──────────────────────────────────────── */}
            {guidePeek.length > 0 && (
              <section id="sec-guide" data-pid="sec-guide" className="mt-20 scroll-mt-24">
                <SectionHead title="Q&A" more="/guide" />
                <IndexList
                  entries={guidePeek.map((g) => ({
                    href: `/guide/${encodeURIComponent(g.slug)}`,
                    label: g.question,
                  }))}
                />
              </section>
            )}

            {/*
              푸터 — 다른 지면들과 같은 공통 SiteFooter.
              한때 자체 판권면(콜로폰: 실린 글·장소·Q&A 수)이 있었는데, 지면마다
              푸터가 달라 보이는 게 더 손해라 공통으로 통일했다.
            */}
            <SiteFooter />
          </>
        )}
      </div>
    </main>
  );
}

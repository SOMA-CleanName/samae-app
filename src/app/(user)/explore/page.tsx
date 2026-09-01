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
  title: "스냅 촬영 이야기와 장소",
  description:
    "가격이 왜 다른지, 뭘 입어야 하는지, 어디서 찍는지. 스냅 촬영을 처음 알아보는 사람이 궁금해할 것들을 사매가 아티클·촬영 장소·자주 묻는 것으로 정리했어요.",
  keywords: ["스냅 촬영", "스냅 가격", "촬영 준비물", "촬영 장소", "스냅 매거진"],
  alternates: { canonical: "/explore" },
  openGraph: {
    title: "스냅 촬영 이야기와 장소 · samae",
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
  이름과 아이콘을 지면에 맞췄다(마스트헤드가 이미 STORIES 다).

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

  const numbered = [
    { id: "sec-articles", label: "스냅 촬영 이야기", show: articles.length > 0 },
    { id: "sec-featured", label: "이번 호의 사진", show: featured.length > 0 },
    { id: "sec-spots", label: "촬영 장소", show: spots.length > 0 },
    { id: "sec-guide", label: "자주 묻는 것", show: guidePeek.length > 0 },
  ]
    .filter((d) => d.show)
    .map((d, i) => ({ ...d, no: String(i + 1).padStart(2, "0") }));

  const no = (id: string) => numbered.find((d) => d.id === id)?.no ?? "";
  const sections: RunningSection[] = numbered.map((d) => ({
    id: d.id,
    no: d.no,
    label: d.label,
  }));

  const empty = numbered.length === 0;

  /*
    이 지면이 무엇의 목록인지 기계에 알려 준다.
    AI 답변이 인용하는 건 사진이 아니라 글이라, 실린 아티클을 ItemList 로 편다.
    (개별 글의 Article 스키마는 /articles/{slug} 가 각자 들고 있다)
  */
  const articleList = itemListJsonLd(
    "스냅 촬영 이야기",
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
      <div className="mx-auto w-full max-w-[1280px] px-4 pt-5 sm:px-6 sm:pt-7">
        <Masthead
          word="STORIES"
          size="compact"
          // 브랜드명·날짜는 뺐다. 매번 같은 값이라 자리만 차지하고 아무것도 안 알려준다.
          // 대신 이 지면이 실제로 무엇을 다루는지 한 줄로 못 박는다.
          lead="가격이 왜 다른지, 뭘 입어야 하는지, 어디서 찍는지."
          // 계정 진입 — 홈·카테고리 지면과 같은 자리(표제 위 오른쪽).
          // 좌하단 아바타를 없앤 뒤로 계정에 닿는 문이 홈에만 있었다. 이 지면은
          // 읽다 보면 오래 머무는 곳이라, 로그아웃 한 번 하려고 홈으로 돌아가야 했다.
          action={
            <ProfileButton
              loggedIn={!!me}
              avatarUrl={me?.avatarUrl ?? null}
              me={toProfileMe(me)}
            />
          }
        />
      </div>

      {/*
        러닝 밴드.
        전에는 아티클 제목과 장소 이름이 한글로 흘렀는데, 긴 문장이 지나가니
        읽으라는 건지 장식인지 애매했다. 잡지 러닝헤드는 읽는 물건이 아니라
        지면을 묶는 띠라서, 짧은 라틴 대문자로 바꿨다.
      */}
      <Marquee className="mt-5 border-y border-line py-2" speed={40}>
        {["SNAP STORIES", "PHOTOGRAPHS", "LOCATIONS", "Q & A"].map((w, i) => (
          <span key={i} className="flex items-center">
            <span className="px-6 text-[11px] font-bold uppercase tracking-[0.28em]">{w}</span>
            <span className="text-brand">✳</span>
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
            {/* ── 스냅 촬영 이야기 ──────────────────────────── */}
            {articles.length > 0 && (
              <section id="sec-articles" data-pid="sec-articles" className="scroll-mt-24">
                <SectionHead
                  no={no("sec-articles")}
                  title="스냅 촬영 이야기"
                  lead="가격도 준비물도 모르는 채 시작하지 않게, 하나씩 적어 둡니다."
                  more="/articles"
                />

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

            {/* ── 이번 호의 사진 ───────────────────────────── */}
            {featured.length > 0 && (
              <section id="sec-featured" data-pid="sec-featured" className="mt-20 scroll-mt-24">
                <SectionHead
                  no={no("sec-featured")}
                  title="이번 호의 사진"
                  lead="요즘 사매에서 가장 많이 열린 사진이에요. 누르면 어떻게 찍었는지 볼 수 있어요."
                />
                <PhotoFeature photos={featured} />
              </section>
            )}

            {/* ── 촬영 장소 ────────────────────────────────── */}
            {spots.length > 0 && (
              <section id="sec-spots" data-pid="sec-spots" className="mt-20 scroll-mt-24">
                <SectionHead
                  no={no("sec-spots")}
                  title="촬영 장소"
                  lead="장소 소개만 있는 글은 많아요. 여기엔 그곳에서 실제로 찍힌 사진이 같이 있어요."
                  more="/spots"
                />
                <SpotsRail spots={spots.slice(0, SPOTS_RAIL_MAX)} total={spots.length} />
              </section>
            )}

            {/* ── 자주 묻는 것 ─────────────────────────────── */}
            {guidePeek.length > 0 && (
              <section id="sec-guide" data-pid="sec-guide" className="mt-20 scroll-mt-24">
                <SectionHead
                  no={no("sec-guide")}
                  title="자주 묻는 것"
                  lead="촬영을 준비하면서 자주 막히는 것들이에요."
                  more="/guide"
                />
                <IndexList
                  entries={guidePeek.map((g) => ({
                    href: `/guide/${encodeURIComponent(g.slug)}`,
                    label: g.question,
                  }))}
                />
              </section>
            )}

            {/*
              판권면(콜로폰) — 잡지 맨 뒤의 그 페이지.

              전에는 "사진부터 보고 싶다면 홈에서" 마퀴가 있었는데, 탭 하나만 누르면
              갈 수 있는 곳을 큰 배너로 안내하는 셈이라 자리만 먹었다.
              대신 이 호에 뭐가 실렸는지를 적는다 — 끝났다는 신호이자 사실이다.
              나중에 광고를 넣는다면 이 위가 그 자리다.
            */}
            <footer className="mt-24 border-t border-line pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
                <span className="font-display text-xl italic leading-none text-brand">samae</span>
                <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-faint">
                  <span className="flex items-baseline gap-1.5">
                    <dt>Stories</dt>
                    <dd className="font-bold tabular-nums text-muted">{articles.length}</dd>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <dt>Locations</dt>
                    <dd className="font-bold tabular-nums text-muted">{spots.length}</dd>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <dt>Q &amp; A</dt>
                    <dd className="font-bold tabular-nums text-muted">
                      {GUIDE_PAGE_ITEMS.length}
                    </dd>
                  </span>
                </dl>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-faint">
                사진을 고르면 그 사진을 찍은 작가로 이어집니다.
              </p>
              {/* 판권면이 이 지면의 푸터 역할을 한다. 공통 푸터를 또 얹지 않고 링크만 얹는다. */}
              <nav aria-label="사매 안내" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px]">
                <Link href="/trust" className="text-muted transition-colors hover:text-brand">
                  안전하게 촬영하기
                </Link>
                <Link href="/privacy" className="text-muted transition-colors hover:text-brand">
                  개인정보 처리방침
                </Link>
              </nav>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}

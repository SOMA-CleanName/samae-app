import type { ReactNode } from "react";

// 피드 최상단 히어로 — 로고 워드마크 + 태그라인. 홈·카테고리 페이지 공용.
//
// 원래 아래에 "원하는 사진을 고르고, 그 작가에게 촬영을 문의하세요." 헤드라인이
// 두 줄로 크게 있었다. 그 문장은 첫 방문 튜토리얼 한가운데로 옮겼다 —
// 처음 온 사람에게 한 번 크게 말하는 게, 올 때마다 상단을 차지하는 것보다 낫다.
//
// h1 은 남긴다. 홈에 제목이 하나도 없으면 검색엔진이 이 페이지가 무엇인지 못 읽는다.
// 그래서 워드마크 줄 자체를 제목으로 올렸다.
export function FeedHero({ right }: { right?: ReactNode }) {
  return (
    // 제목은 왼쪽, 오른쪽 빈자리는 슬롯으로 열어 둔다(홈은 프로필 버튼이 들어온다).
    // 여백을 바싹 조였다. 로고 줄은 브랜드를 알리는 자리지 공간을 차지하는 자리가 아니다.
    <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3 px-1 pb-2 pt-1.5 sm:pb-2.5 sm:pt-2">
      <h1 className="shrink-0 font-display text-[1.6rem] italic leading-none text-brand sm:text-[1.7rem]">
        samae
        {/* 화면에는 안 보이지만 검색엔진·스크린리더에는 이 페이지가 무엇인지 남긴다.
            워드마크만 남기면 제목이 브랜드명 한 단어뿐이라 무슨 서비스인지 읽히지 않는다. */}
        <span className="sr-only"> — 사진으로 고르는 촬영, 사진작가 매칭</span>
      </h1>
      {right}
    </div>
  );
}

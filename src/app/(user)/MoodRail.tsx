"use client";

import { useState } from "react";
import Image from "next/image";
import { TrackedCategoryLink } from "./explore/TrackedCategoryLink";

export type MoodItem = {
  slug: string;
  title: string;
  url: string;
  /** 운영자가 오늘 골라 둔 무드인지. 앞쪽에 오고 표식이 붙는다. */
  curated?: boolean;
};

/**
 * 무드 — 기본은 접혀 있고, 펼치면 전부 보인다.
 *
 * 전에는 '오늘의 큐레이션'(세로 캐러셀)과 '추천 무드'(2열 격자)가 따로 있었다.
 * 둘 다 결국 무드를 보여주는 섹션이라 나란히 두면 같은 걸 두 번 보는 꼴인데,
 * 세로로만 1000px 가까이 먹었다. 하나로 합치고 작은 정사각 칩 격자로 줄였다.
 *
 * 그마저도 접어 둔다. 홈에 온 사람의 목적은 사진 피드지 무드 고르기가 아니다.
 * 필요한 사람만 펼치면 되고, 접힌 한 줄만으로도 "이런 게 있다"는 읽힌다.
 *
 * 운영자 큐레이션은 버리지 않는다 — 큐레이션한 무드가 앞에 오고 ✳︎ 가 붙는다.
 */

/*
  접힌 상태에서 보여줄 개수 — **칸 수와 같아야 한다.**

  칸은 폭에 따라 4/6/8로 늘어나는데 접힘 개수는 4로 고정돼 있었다. 그래서
  데스크톱에서는 8칸짜리 줄에 사진 4장만 놓이고 오른쪽 절반이 빈 채로 남았다.
  줄을 정확히 채우려면 둘이 같은 값이어야 하고, 개수는 서버·클라이언트가 같아야
  하므로(하이드레이션) 자바스크립트로 폭을 재지 않는다 — 최대치(8)만큼 그려 두고
  좁은 화면에서 넘치는 칸을 CSS 로 감춘다.
*/
const COLLAPSED = 4; // 폰 — 한 줄 4칸
const COLLAPSED_SM = 6; // sm~
const COLLAPSED_LG = 8; // lg~

export function MoodRail({ items }: { items: MoodItem[] }) {
  const [open, setOpen] = useState(false);
  const hasMore = items.length > COLLAPSED;
  const shown = open || !hasMore ? items : items.slice(0, COLLAPSED_LG);

  return (
    <>
      {/*
        섹션 머리 — 제목 왼쪽, 펼침 토글 오른쪽.

        토글은 원래 격자 **아래** 전폭 버튼이었다. 그 한 줄이 모바일에서 50px
        (버튼 38 + 위 여백 12)을 먹는데, 제목 줄 오른쪽은 그동안 비어 있었다.
        같은 일을 하는 물건을 이미 있는 줄에 얹으면 한 줄이 통째로 사라진다.
        (애플 뮤직·스포티파이의 섹션 머리와 같은 배치)

        머리를 이 컴포넌트 안으로 들인 이유도 그것이다 — 토글은 클라이언트 상태라
        서버 컴포넌트(HomeDiscoverySections)의 머리와 같은 줄에 설 수 없었다.
      */}
      <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <span aria-hidden className="mb-2 block h-[2px] w-6 bg-brand" />
          <h2 className="text-body font-bold tracking-tight">무드로 보기</h2>
        </div>
        {hasMore && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={[
              // 44px 터치 타겟 — 글자만 두면 12px 짜리 과녁이 된다
              "-mr-2 flex shrink-0 items-center gap-1 rounded-full px-2 py-2.5 text-body-sm font-semibold text-muted transition-colors hover:bg-fg/[0.05] hover:text-fg",
              /*
                펼칠 게 남았는지는 폭마다 다르다. 무드가 7개면 lg(8칸)에서는 접힘
                상태로 이미 다 보이는데 토글이 남아, 눌러도 아무 일이 없는 버튼이 된다.
                개수와 마찬가지로 폭은 재지 않고(하이드레이션) CSS 로 감춘다.
              */
              !open && items.length <= COLLAPSED_SM ? "sm:hidden" : "",
              !open && items.length <= COLLAPSED_LG ? "lg:hidden" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {open ? "접기" : `${items.length}개 모두`}
            <span
              aria-hidden
              className={`inline-block text-[11px] transition-transform duration-300 ${
                open ? "rotate-180" : ""
              }`}
            >
              ▾
            </span>
          </button>
        )}
      </div>

      {/*
        접힘·펼침 모두 격자다. 가로 스크롤을 같이 두면 안 된다 —
        옆으로 밀어도 더 보이고 버튼으로도 더 보이니, 조작이 둘이라 헷갈린다.
        접힘은 딱 한 줄, 펼치면 나머지가 아래로 이어진다.
      */}
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {shown.map((it, i) => (
          <li
            key={it.slug}
            className={[
              // 펼칠 때 새로 들어오는 칸만 애니메이션 — 접힘에서 이미 보이던 건 제외
              i >= COLLAPSED_LG ? "mood-in" : "",
              // 접힘 상태에서 이 폭의 한 줄을 넘는 칸은 감춘다
              !open && i >= COLLAPSED_SM ? "hidden lg:block" : "",
              !open && i >= COLLAPSED && i < COLLAPSED_SM ? "hidden sm:block" : "",
            ]
              .filter(Boolean)
              .join(" ") || undefined}
          >
            <Chip item={it} rank={i + 1} />
          </li>
        ))}
      </ul>

    </>
  );
}

function Chip({ item, rank }: { item: MoodItem; rank: number }) {
  return (
    <TrackedCategoryLink
      href={`/explore/${item.slug}`}
      category={item.title}
      slug={item.slug}
      rank={rank}
      source="home_mood_rail"
      className="group block"
    >
      {/*
        제목은 **사진 안**에 얹는다.

        전에는 카드 아래 별도 줄이었다(mt-1.5 + min-h 2.1rem ≈ 40px). 칸이 한 줄뿐인
        접힘 상태에서 그 40px 은 통째로 아래 사진을 밀어내는 값이다. 사진 위로 올리면
        무드 섹션이 220px → 약 136px 이 된다.

        밝은 사진에서도 흰 글자가 읽히도록 아래쪽에 검은 그라데이션을 깐다 — 배너 제목이
        이미 쓰는 방식이라 지면이 하나로 읽힌다. 글자에 그림자도 함께 준다(그라데이션만으로는
        하늘·눈처럼 흰 영역에서 모자란다).
      */}
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-fg/[0.06]">
        <Image
          src={item.url}
          alt=""
          fill
          quality={80}
          /*
            칸 수가 폭마다 달라(4/6/8) 고정 124px 는 맞지 않아 비율로 바꿨다.
            ⚠️ 단, 지금은 아무 효과가 없다 — next.config 가 images.unoptimized:true 라
               srcset 을 안 만들고 quality·sizes 를 통째로 무시한다(원본 500px 썸네일 직행).
               최적화를 다시 켜는 날을 위해 값만 맞춰 둔다.
          */
          sizes="(min-width: 1024px) 12vw, (min-width: 640px) 16vw, 24vw"
          className="object-cover transition-transform duration-700 group-hover:scale-[1.06]"
        />

        {/* 글자 받침 — 사진 아래 60%에만 깔아 위쪽 그림은 가리지 않는다 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/75 via-black/35 to-transparent"
        />

        <p className="absolute inset-x-0 bottom-0 flex items-start gap-0.5 p-1.5">
          {item.curated && (
            <span
              aria-label="오늘의 큐레이션"
              className="mt-px text-[10px] leading-[1.35] text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
            >
              ✳︎
            </span>
          )}
          {/*
            제목 길이는 운영자가 정하는 값이라 코드에서 짧게 강제하지 않는다.
            두 줄까지 풀고 그 이상은 자른다 — 87px 카드에서 세 줄이면 사진이 안 보인다.
          */}
          <span className="line-clamp-2 text-[11.5px] font-bold leading-[1.35] tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
            {item.title}
          </span>
        </p>
      </div>
    </TrackedCategoryLink>
  );
}

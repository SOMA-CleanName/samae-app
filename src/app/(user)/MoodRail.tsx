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
 * 운영자 큐레이션은 버리지 않는다 — 큐레이션한 무드가 앞에 오고 ✳ 가 붙는다.
 */

/** 접힌 상태에서 보여줄 개수. 한 줄(4칸)만 두고 나머지는 버튼으로 편다. */
const COLLAPSED = 4;

export function MoodRail({ items }: { items: MoodItem[] }) {
  const [open, setOpen] = useState(false);
  const hasMore = items.length > COLLAPSED;
  const shown = open || !hasMore ? items : items.slice(0, COLLAPSED);

  return (
    <>
      {/*
        접힘·펼침 모두 격자다. 가로 스크롤을 같이 두면 안 된다 —
        옆으로 밀어도 더 보이고 버튼으로도 더 보이니, 조작이 둘이라 헷갈린다.
        접힘은 딱 4칸, 펼치면 나머지가 아래로 이어진다.
      */}
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {shown.map((it, i) => (
          <li key={it.slug} className={i >= COLLAPSED ? "mood-in" : undefined}>
            <Chip item={it} rank={i + 1} />
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-line bg-surface py-2 text-body-sm font-semibold transition-colors hover:bg-surface-2"
        >
          {open ? "접기" : `무드 ${items.length}개 모두 보기`}
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
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-fg/[0.06]">
        <Image
          src={item.url}
          alt=""
          fill
          quality={80}
          sizes="124px"
          className="object-cover transition-transform duration-700 group-hover:scale-[1.06]"
        />
      </div>
      <p className="mt-1.5 flex items-center gap-1 px-0.5">
        {item.curated && (
          <span aria-label="오늘의 큐레이션" className="text-[10px] text-brand">
            ✳
          </span>
        )}
        <span className="truncate text-[12px] font-bold tracking-tight transition-colors group-hover:text-brand">
          {item.title}
        </span>
      </p>
    </TrackedCategoryLink>
  );
}

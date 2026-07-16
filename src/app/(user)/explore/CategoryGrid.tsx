"use client";

import Image from "next/image";
import { useState } from "react";
import { TrackedCategoryLink } from "./TrackedCategoryLink";
import styles from "./explore.module.css";

export type GridItem = { slug: string; title: string; subtitle: string; url: string };

const INITIAL = 5;

// 카테고리 타일 그리드 — 처음 5개만, '더보기'로 전체. 첫 타일은 가로 와이드.
export function CategoryGrid({ items }: { items: GridItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, INITIAL);
  const rest = items.length - INITIAL;
  // 접힘: 다음 2장을 절반만(peek) 보여 더보기 유도
  const peek = expanded ? [] : items.slice(INITIAL, INITIAL + 2);

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        {shown.map((it, i) => (
          <Tile
            key={it.slug}
            item={it}
            big={i === 0}
            index={i}
            // 펼침: 이미 걸쳐 보이던 2장(index 5·6)은 애니 없이, 그 다음 줄(7+)부터 한 번에 등장
            reveal={expanded ? i >= INITIAL + 2 : true}
            revealDelay={expanded ? 0 : Math.min(i, 6) * 55}
          />
        ))}
      </div>

      {/* 접힘: 다음 2장을 절반만(peek) + 하단 어둡게 페이드 */}
      {peek.length > 0 && (
        <div className="relative mt-2.5 h-24 overflow-hidden">
          <div className="grid grid-cols-2 gap-2.5">
            {peek.map((it, i) => (
              <Tile key={it.slug} item={it} big={false} index={INITIAL + i} revealDelay={0} />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-transparent" />
        </div>
      )}

      {rest > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-line bg-surface py-2 text-body font-medium text-fg transition-colors hover:bg-surface-2"
        >
          {expanded ? "접기" : "무드 더 보기"}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 text-brand transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}
    </>
  );
}

function Tile({
  item,
  big,
  index,
  dim = false,
  revealDelay = 0,
  reveal = true,
}: {
  item: GridItem;
  big: boolean;
  index: number;
  dim?: boolean;
  revealDelay?: number;
  reveal?: boolean;
}) {
  return (
    <TrackedCategoryLink
      href={`/explore/${item.slug}`}
      category={item.title}
      slug={item.slug}
      rank={index + 1}
      style={reveal ? { animationDelay: `${revealDelay}ms` } : undefined}
      className={`${reveal ? styles.reveal : ""} group relative flex flex-col justify-end overflow-hidden rounded-2xl bg-fg/[0.06] p-3.5 text-white ${
        big ? "col-span-2 aspect-[16/9]" : "aspect-square"
      }`}
    >
      <Image
        src={item.url}
        alt=""
        fill
        quality={85}
        sizes={big ? "(max-width: 640px) 100vw, 430px" : "(max-width: 640px) 50vw, 215px"}
        className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/10 to-transparent" />
      {dim && <div aria-hidden className="absolute inset-0 bg-black/55" />}
      <h3
        className={`relative font-bold leading-tight tracking-tight [text-wrap:balance] ${
          big ? "max-w-[75%] text-xl" : "text-body"
        }`}
      >
        {item.title}
      </h3>
      {item.subtitle && (
        <p className="relative mt-1.5 font-display text-caption italic text-white/75">
          {item.subtitle}
        </p>
      )}
    </TrackedCategoryLink>
  );
}

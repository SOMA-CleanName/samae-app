"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronDownIcon } from "@/components/user/icons";
import { TrackedCategoryLink } from "./TrackedCategoryLink";
import styles from "./explore.module.css";

export type GridItem = { slug: string; title: string; subtitle: string; url: string };

const INITIAL = 5;

// 카테고리 타일 그리드 — 처음 5개만, '더보기'로 전체. 첫 타일은 가로 와이드.
export function CategoryGrid({ items }: { items: GridItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, INITIAL);
  const rest = items.length - INITIAL;

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        {shown.map((it, i) => (
          <Tile
            key={it.slug}
            item={it}
            big={i === 0}
            index={i}
            // 접힌 상태: 마지막 줄(더보기 근처) 타일은 사진마다 어둡게 → 더보기 유도
            dim={!expanded && rest > 0 && i >= shown.length - 2}
            // 초기 5개는 스태거, '무드 더 보기'로 추가되는 타일(index>=5)은 딜레이 0으로 한 번에 올라옴
            revealDelay={expanded && i >= INITIAL ? 0 : Math.min(i, 6) * 55}
          />
        ))}
      </div>

      {rest > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-line bg-surface py-3 text-body font-medium text-fg transition-colors hover:bg-surface-2"
        >
          {expanded ? "접기" : "무드 더 보기"}
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
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
}: {
  item: GridItem;
  big: boolean;
  index: number;
  dim?: boolean;
  revealDelay?: number;
}) {
  return (
    <TrackedCategoryLink
      href={`/explore/${item.slug}`}
      category={item.title}
      slug={item.slug}
      rank={index + 1}
      style={{ animationDelay: `${revealDelay}ms` }}
      className={`${styles.reveal} group relative flex flex-col justify-end overflow-hidden rounded-2xl bg-fg/[0.06] p-3.5 text-white ${
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

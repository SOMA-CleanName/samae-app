"use client";

import { cn } from "@/lib/cn";
import { useScrollCollapse } from "@/lib/use-scroll-collapse";
import { SearchPill } from "./SearchPill";
import { SearchOptions } from "./SearchOptions";

// 탐색 화면 전용 sticky 헤더 — 검색 + 보기 옵션(가격 표시 등).
// 아래로 스크롤하면 위로 접혀 사라지고, 위로 스크롤하면 다시 등장(탐색 시 화면 확보).
export function ExploreHeader() {
  const hidden = useScrollCollapse();
  return (
    <div
      className={cn(
        "sticky top-0 z-30 -mx-3 mb-1 flex items-center gap-2 bg-bg/85 px-3 py-3 backdrop-blur transition-transform duration-200 will-change-transform sm:-mx-5 sm:px-5",
        hidden && "-translate-y-full"
      )}
    >
      <SearchPill />
      <SearchOptions />
    </div>
  );
}

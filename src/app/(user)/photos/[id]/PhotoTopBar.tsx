"use client";

import { useRouter } from "next/navigation";
import { SearchPill } from "@/components/user/SearchPill";
import { SearchOptions } from "@/components/user/SearchOptions";
import { ArrowLeftIcon } from "@/components/user/icons";

// 이미지 상세(2단계) 상단바 — 1단계처럼 항상 솔리드로 고정. 뒤로가기 + 검색 + 보기 옵션.
export function PhotoTopBar() {
  const router = useRouter();

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <div className="fixed inset-x-0 top-0 z-30 border-b border-line bg-bg/85 backdrop-blur md:left-[72px]">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full bg-fg/[0.06] text-fg transition-colors hover:bg-fg/[0.1]"
        >
          <ArrowLeftIcon />
        </button>
        <div className="flex flex-1 items-center gap-2">
          <SearchPill />
          <SearchOptions />
        </div>
      </div>
    </div>
  );
}

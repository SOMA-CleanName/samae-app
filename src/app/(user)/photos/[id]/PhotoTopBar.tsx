"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@/components/user/icons";
import { ShareButton } from "@/components/user/ShareButton";

// 이미지 상세(2단계) 상단바 — 뒤로가기 + 공유. (검색바는 노출 안 함: 이탈 유도 방지)
export function PhotoTopBar() {
  const router = useRouter();

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <div className="fixed inset-x-0 top-0 z-30">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full bg-bg/80 text-fg shadow-sm ring-1 ring-line backdrop-blur transition-colors hover:bg-bg"
        >
          <ArrowLeftIcon />
        </button>
        <ShareButton />
      </div>
    </div>
  );
}

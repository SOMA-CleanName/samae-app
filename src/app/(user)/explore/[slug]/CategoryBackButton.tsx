"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@/components/user/icons";

// 카테고리(태그) 페이지 뒤로가기 — 뷰포트에 고정(fixed)해 스크롤해도 좌상단에 계속 떠 있게 한다.
// 히스토리가 있으면 뒤로, 없으면 탐색 탭으로.
export function CategoryBackButton() {
  const router = useRouter();

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/explore");
  }

  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="뒤로"
      className="fixed left-3 top-3 z-30 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55"
    >
      <ArrowLeftIcon />
    </button>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@/components/user/icons";
import {
  getBackNavigationAction,
  getPhotoBackButtonMode,
} from "@/lib/photo-back-button";

// 상세 검색창과 나란히 보이도록 뷰포트 좌상단의 기존 위치를 유지한다.
export function PhotoTopBar() {
  const router = useRouter();
  const mode = getPhotoBackButtonMode();

  function onBack() {
    const historyLength = typeof window === "undefined" ? 0 : window.history.length;
    if (getBackNavigationAction(historyLength) === "history") router.back();
    else router.push("/");
  }

  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="뒤로"
      data-mode={mode}
      className="fixed left-3 top-3 z-30 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55"
    >
      <ArrowLeftIcon />
    </button>
  );
}

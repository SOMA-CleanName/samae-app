"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@/components/user/icons";

// 이미지 위 투명 뒤로가기 오버레이 — 이미지를 화면 최상단에 두기 위해 바 대신 오버레이.
// (부모가 relative 여야 함)
export function PhotoTopBar() {
  const router = useRouter();

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="뒤로"
      className="absolute left-3 top-3 z-20 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55"
    >
      <ArrowLeftIcon />
    </button>
  );
}

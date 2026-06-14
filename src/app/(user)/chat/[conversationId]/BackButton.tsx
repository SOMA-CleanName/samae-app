"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@/components/user/icons";

// 채팅방 뒤로가기 — 직전 페이지로. 히스토리가 없으면(직접 진입) 채팅 목록으로 폴백.
export function BackButton() {
  const router = useRouter();
  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/chat");
  }
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="뒤로 가기"
      className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-fg/70 transition-colors hover:bg-fg/[0.06]"
    >
      <ArrowLeftIcon className="h-5 w-5" />
    </button>
  );
}

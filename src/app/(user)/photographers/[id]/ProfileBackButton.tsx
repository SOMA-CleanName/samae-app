"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@/components/user/icons";

// 작가 프로필 상단 뒤로가기 — history 있으면 back, 없으면 홈.
export function ProfileBackButton() {
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
      className="mb-1 grid h-9 w-9 cursor-pointer place-items-center rounded-full text-fg transition-colors hover:bg-fg/[0.06]"
    >
      <ArrowLeftIcon />
    </button>
  );
}

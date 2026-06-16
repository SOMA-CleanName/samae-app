"use client";

import { useRouter } from "next/navigation";

export function InquiryBackButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="text-sm text-fg/50 transition-colors hover:text-fg"
    >
      ← 뒤로 가기
    </button>
  );
}

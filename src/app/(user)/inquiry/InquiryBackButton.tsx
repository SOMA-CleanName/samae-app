"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@/components/user/icons";

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
      aria-label="뒤로"
      className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full bg-fg/[0.06] text-fg transition-colors hover:bg-fg/[0.1]"
    >
      <ArrowLeftIcon />
    </button>
  );
}

"use client";

import { useRouter } from "next/navigation";

import { canGoBackInApp } from "@/lib/in-app-nav";
import { forgetSearchImage } from "@/lib/image-search-client";
import { ArrowLeftIcon } from "@/components/user/icons";

/**
 * 사진 검색에서 나가는 버튼 — 글 검색의 SearchBackButton 과 같은 자리·같은 모양(검색창 왼쪽).
 * 나가면서 들고 있던 사진을 지운다. 안 지우면 다음에 이 화면에 오자마자 같은 사진으로 다시 찾는다.
 */
export function ExitImageSearch() {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="사진 검색 나가기"
      onClick={() => {
        forgetSearchImage();
        if (canGoBackInApp()) router.back();
        else router.push("/");
      }}
      className="grid h-[42px] w-10 shrink-0 cursor-pointer place-items-center rounded-md text-fg transition-colors hover:bg-fg/[0.06] hover:text-brand"
    >
      <ArrowLeftIcon className="h-5 w-5" />
    </button>
  );
}

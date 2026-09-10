"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { canGoBackInApp } from "@/lib/in-app-nav";
import { searchSessionStorageKeys } from "@/lib/search-navigation";
import { ArrowLeftIcon } from "@/components/user/icons";

/**
 * 검색 결과에서 나가는 버튼.
 *
 * 사진 상세의 뒤로가기(PhotoTopBar)를 그대로 쓰고 있었는데, 그건 사진 위에 뜨라고
 * 만든 검은 반투명 원이다. 검색 결과는 밝은 지면이라 거기서만 혼자 겉돌았고,
 * 화면에 떠 있느라 검색창까지 ml-12 로 밀어내고 있었다.
 * 흐름 안으로 들여 검색창과 같은 줄에 세운다 — 높이도 검색창과 맞춘다.
 *
 * 나가면서 이 검색어로 쌓인 스크롤·피드 세션을 비운다. 안 비우면 다음에 같은 말을
 * 검색했을 때 예전 스크롤 위치로 떨어진다.
 */
export function SearchBackButton({ query }: { query: string }) {
  const router = useRouter();
  const pathname = usePathname();

  function onBack() {
    try {
      searchSessionStorageKeys(pathname, query).forEach((key) =>
        sessionStorage.removeItem(key)
      );
    } catch {
      /* 저장소 접근 불가 시 무시 */
    }
    // 앱 안에서 들어왔으면 온 곳으로. 검색 링크로 바로 들어왔으면 홈으로.
    if (canGoBackInApp()) router.back();
    else router.push("/");
  }

  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="검색 나가기"
      className="grid h-[42px] w-10 shrink-0 cursor-pointer place-items-center rounded-md text-fg transition-colors hover:bg-fg/[0.06] hover:text-brand"
    >
      <ArrowLeftIcon className="h-5 w-5" />
    </button>
  );
}

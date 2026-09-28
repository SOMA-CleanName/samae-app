import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { SearchDock } from "@/components/user/SearchDock";
import { SEARCH_PLACEHOLDER_SHORT } from "@/lib/search-copy";
import { SiteFooter } from "@/components/SiteFooter";
import { ExitImageSearch } from "./ExitImageSearch";
import { ImageSearchResults } from "./ImageSearchResults";

// 검색할 사진은 브라우저 안에만 있다(docs/42 §7-1) — 서버가 미리 그릴 것이 없고, 색인할 지면도 아니다.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "사진으로 검색", robots: { index: false, follow: false } };

export default async function ImageSearchPage() {
  const me = await getCurrentUser();

  return (
    // 홈 검색 결과와 같은 여백 — 격자 위치가 두 화면에서 어긋나지 않게
    <main className="mx-auto max-w-screen-2xl px-2.5 pb-2.5 pt-3.5 font-kr sm:px-4 sm:pt-5 sm:pb-4">
      <SearchDock placeholder={SEARCH_PLACEHOLDER_SHORT} variant="detail" back={<ExitImageSearch />} />
      <ImageSearchResults likedIds={[]} loggedIn={!!me?.id} />
      <SiteFooter />
    </main>
  );
}

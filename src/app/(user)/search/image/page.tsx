import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { SearchDock } from "@/components/user/SearchDock";
import { SEARCH_PLACEHOLDER_SHORT } from "@/lib/search-copy";
import { SiteFooter } from "@/components/SiteFooter";
import { ImageSearchResults } from "./ImageSearchResults";

// 검색할 사진은 브라우저 안에만 있다(docs/42 §7-1) — 서버가 미리 그릴 것이 없고, 색인할 지면도 아니다.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "사진으로 검색", robots: { index: false, follow: false } };

export default async function ImageSearchPage() {
  const me = await getCurrentUser();

  return (
    <main className="px-1 pb-16 pt-2 sm:px-2">
      <SearchDock placeholder={SEARCH_PLACEHOLDER_SHORT} />
      <ImageSearchResults likedIds={[]} loggedIn={!!me?.id} />
      <SiteFooter />
    </main>
  );
}

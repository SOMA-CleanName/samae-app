"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { searchHref } from "@/lib/search-navigation";
import { SearchIcon } from "./icons";

/** 홈과 검색 결과 상단에서 사용하는 자연어 사진 검색창. */
export function SearchPill({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initial);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    router.push(searchHref(query));
  }

  return (
    <form onSubmit={submit} role="search" className="relative w-full">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
        <SearchIcon className="h-5 w-5" />
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="원하는 사진 분위기를 검색해보세요"
        aria-label="사진 분위기 검색"
        autoComplete="off"
        maxLength={120}
        className="h-12 w-full rounded-full border border-line-strong bg-surface pl-11 pr-5 text-body-sm text-fg shadow-sm outline-none transition placeholder:text-faint focus:border-fg/35 focus:ring-2 focus:ring-fg/10"
      />
    </form>
  );
}

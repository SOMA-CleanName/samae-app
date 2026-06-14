"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "./icons";

// 무드 태그 검색 입력 — 제출 시 탐색 홈(/?q=)으로 이동. 메인·이미지 상세 공용.
export function SearchPill({
  placeholder = "무드 태그로 검색 (예: 감성, 흑백, 우드톤)",
}: {
  placeholder?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    router.push(v ? `/?q=${encodeURIComponent(v)}` : "/");
  }

  return (
    <form onSubmit={onSubmit} className="relative flex-1">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint">
        <SearchIcon />
      </span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label="무드 태그 검색"
        className="h-11 w-full rounded-full bg-fg/[0.06] pl-11 pr-4 text-sm outline-none transition focus:bg-surface focus:ring-2 focus:ring-fg/15"
      />
    </form>
  );
}

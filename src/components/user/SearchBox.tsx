"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mpTrack } from "@/lib/mixpanel";

// 작가 검색 입력 — 제출 시 ?q= 로 탐색 홈 이동
export function SearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    if (v) mpTrack("Search", { query: v });
    router.push(v ? `/?q=${encodeURIComponent(v)}` : "/");
  }

  return (
    <form onSubmit={onSubmit} className="relative flex-1 max-w-xs">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="작가 이름·지역 검색"
        className="w-full rounded-full border border-fg/15 bg-surface px-4 py-1.5 text-sm outline-none focus:border-fg/40"
      />
    </form>
  );
}

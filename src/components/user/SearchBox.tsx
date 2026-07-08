"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 작가 검색 입력 — 제출 시 ?q= 로 탐색 홈 이동.
// (Search 이벤트는 서버 logSearch 에서 result_count 와 함께 발화 — 여기선 안 쏨)
export function SearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
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

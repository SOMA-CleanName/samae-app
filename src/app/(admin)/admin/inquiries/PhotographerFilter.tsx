"use client";

import { useRouter, useSearchParams } from "next/navigation";

// 작가별 문의 필터 — 선택 시 pg 쿼리만 갱신(현재 stage 필터는 유지).
export function PhotographerFilter({
  photographers,
  current,
}: {
  photographers: { id: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const q = new URLSearchParams(params.toString());
    if (e.target.value) q.set("pg", e.target.value);
    else q.delete("pg");
    const s = q.toString();
    router.push(s ? `/admin/inquiries?${s}` : "/admin/inquiries");
  };

  return (
    <label className="flex items-center gap-2">
      <span className="text-caption text-muted">작가</span>
      <select
        value={current}
        onChange={onChange}
        className="min-w-40 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-caption outline-none focus:border-fg/40"
      >
        <option value="">전체 작가</option>
        {photographers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// 작가 신청 로딩 — 제목 · 카드(상태/폼) 자리.
export default function Loading() {
  return (
    <main className="mx-auto max-w-lg px-3.5 py-10 font-kr sm:px-5">
      <div className="h-7 w-28 animate-pulse rounded bg-surface-2" />
      <div className="mt-6 space-y-3 rounded-2xl border border-line p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
      </div>
    </main>
  );
}

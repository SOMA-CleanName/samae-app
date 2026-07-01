// 환불 신청 로딩 — 제목 · 안내 카드 · CTA 자리.
export default function Loading() {
  return (
    <main className="mx-auto max-w-lg px-3.5 py-8 font-kr sm:px-5">
      <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
      <div className="mt-4 h-7 w-32 animate-pulse rounded bg-surface-2" />
      <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-surface-2" />

      <div className="mt-6 rounded-xl border border-fg/10 p-5">
        <div className="h-5 w-1/2 animate-pulse rounded bg-surface-2" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-surface-2" />
        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-surface-2" />
      </div>

      <div className="mt-6 h-12 w-full animate-pulse rounded-xl bg-brand/15" />
    </main>
  );
}

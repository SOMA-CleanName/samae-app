// 송금 안내(결제) 로딩 — 제목 · 금액 카드 · CTA 자리.
export default function Loading() {
  return (
    <main className="mx-auto max-w-lg px-3.5 py-8 font-kr sm:px-5">
      <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
      <div className="mt-4 h-7 w-32 animate-pulse rounded bg-surface-2" />
      <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-surface-2" />

      <div className="mt-6 rounded-xl border border-fg/10 p-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mt-3 flex justify-between gap-4 first:mt-0">
            <div className="h-4 w-20 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
        <div className="mt-4 flex items-center justify-between border-t border-fg/10 pt-4">
          <div className="h-5 w-16 animate-pulse rounded bg-surface-2" />
          <div className="h-6 w-28 animate-pulse rounded bg-surface-2" />
        </div>
      </div>

      <div className="mt-6 h-12 w-full animate-pulse rounded-xl bg-brand/15" />
    </main>
  );
}

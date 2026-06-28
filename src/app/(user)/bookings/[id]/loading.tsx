// 예약 상세 로딩 — 상태/금액/액션 카드 자리
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 font-kr">
      <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
      <div className="mt-4 space-y-4">
        <div className="h-6 w-28 animate-pulse rounded-full bg-surface-2" />
        <div className="rounded-2xl border border-line p-4">
          <div className="h-5 w-1/2 animate-pulse rounded bg-surface-2" />
          <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-surface-2" />
          <div className="mt-2 h-4 w-2/5 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-12 w-full animate-pulse rounded-xl bg-surface-2" />
      </div>
    </div>
  );
}

// 계정 설정 로딩 — 제목 · 프로필(아바타+이름) · 입력 섹션 자리.
export default function Loading() {
  return (
    <main className="mx-auto max-w-lg px-3.5 py-8 font-kr sm:px-5">
      <div className="h-7 w-28 animate-pulse rounded bg-surface-2" />
      <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-surface-2" />

      <section className="mt-6 flex items-center gap-4">
        <div className="h-16 w-16 animate-pulse rounded-full bg-surface-2" />
        <div className="h-10 w-32 animate-pulse rounded-xl bg-surface-2" />
      </section>

      <section className="mt-8 space-y-3">
        <div className="h-4 w-20 animate-pulse rounded bg-surface-2" />
        <div className="h-11 w-full animate-pulse rounded-xl bg-surface-2" />
      </section>
    </main>
  );
}

// 챗봇 진입 스켈레톤 — 위저드 스켈레톤 대신 도착할 화면과 같은 챗 레이아웃을 미리 보여준다
// (헤더 실루엣 + 봇 버블 2개 + 입력바). 레이아웃 시프트 없이 자연스럽게 이어진다.
export default function InquiryBotLoading() {
  return (
    <div className="fixed inset-0 z-30 mx-auto flex h-[100svh] max-w-xl flex-col bg-bg font-kr">
      {/* 헤더 실루엣 */}
      <header className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
        <div className="h-11 w-11 shrink-0" />
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
        </div>
      </header>

      {/* 봇 버블 스켈레톤 2개 */}
      <div className="flex-1 space-y-3 overflow-hidden px-4 py-5">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-2" />
          <div className="h-14 w-3/5 animate-pulse rounded-2xl rounded-tl-md bg-surface-2" />
        </div>
        <div className="flex items-start gap-2">
          <div className="mt-0.5 h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-2" />
          <div className="h-10 w-2/5 animate-pulse rounded-2xl rounded-tl-md bg-surface-2" />
        </div>
      </div>

      {/* 입력바 실루엣 */}
      <div className="flex items-center gap-2 border-t border-line px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-2" />
        <div className="h-10 min-w-0 flex-1 animate-pulse rounded-full bg-surface-2" />
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-2" />
      </div>
    </div>
  );
}

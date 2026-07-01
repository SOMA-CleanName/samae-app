// 채팅방 로딩 스켈레톤 — 헤더(아바타·이름) · 메시지 버블 · 입력 바 자리.
// 부모 (user)/chat 의 리스트 스켈레톤이 아니라 '방' 레이아웃에 맞춤.
export default function Loading() {
  return (
    <main className="font-kr">
      <div className="mx-auto flex h-dvh max-w-2xl flex-col -mb-24 md:mb-0">
        {/* 헤더 */}
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-2 sm:px-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />
          <div className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />
          <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
          <div className="ml-auto h-8 w-20 animate-pulse rounded-full bg-surface-2" />
        </header>

        {/* 메시지 영역 — 좌/우 버블 교대 */}
        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-5 sm:px-4">
          <div className="mr-auto h-14 w-3/5 animate-pulse rounded-2xl rounded-tl-md bg-surface-2" />
          <div className="ml-auto h-10 w-2/5 animate-pulse rounded-2xl rounded-tr-md bg-brand/[0.10]" />
          <div className="mr-auto h-20 w-3/4 animate-pulse rounded-2xl rounded-tl-md bg-surface-2" />
          <div className="ml-auto h-10 w-1/3 animate-pulse rounded-2xl rounded-tr-md bg-brand/[0.10]" />
          <div className="mr-auto h-12 w-1/2 animate-pulse rounded-2xl rounded-tl-md bg-surface-2" />
        </div>

        {/* 입력 바 */}
        <div className="shrink-0 border-t border-line px-3 py-2.5 sm:px-4">
          <div className="h-11 w-full animate-pulse rounded-full bg-surface-2" />
        </div>
      </div>
    </main>
  );
}

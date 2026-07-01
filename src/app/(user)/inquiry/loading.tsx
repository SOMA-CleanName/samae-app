// 무료 상담 신청(/inquiry · /inquiry/cart · /inquiry/photo) 로딩 스켈레톤.
// InquiryChat 레이아웃(풀스크린 채팅형: 헤더+진행률 · 사진 미리보기 · 대화 버블 · 입력 카드)에 맞춤.
export default function Loading() {
  return (
    <main className="bg-bg">
      <div className="fixed inset-0 z-50 mx-auto flex h-[100svh] max-w-xl flex-col bg-bg font-kr">
        {/* 헤더 — 정적 텍스트는 그대로, 진행률 0% */}
        <header className="border-b border-line">
          <div className="flex items-center gap-2 px-4 pt-3">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">무료 상담 신청</p>
              <p className="text-sm text-muted">보통 1시간 내 답변드려요</p>
            </div>
          </div>
          <div className="px-4 pb-3 pt-2">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-muted">답변 진행률</span>
              <span className="text-lg font-extrabold tabular-nums leading-none text-brand">0%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-fg/[0.08]" />
          </div>
        </header>

        {/* 대화 영역 — 사진 미리보기 + 작가 버블 + 입력 카드 자리 */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
          {/* 문의 사진 미리보기 */}
          <div className="aspect-[4/5] w-full animate-pulse rounded-xl bg-surface-2" />

          {/* 작가(왼쪽) 버블 */}
          <div className="mr-auto w-full max-w-[92%] space-y-2 rounded-2xl rounded-tl-md bg-surface-2 p-3.5">
            <div className="h-4 w-3/4 animate-pulse rounded bg-fg/[0.06]" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-fg/[0.06]" />
          </div>

          {/* 첫 질문 입력 카드(오른쪽 · 브랜드 톤) — 선택지 칩 + 입력란 자리 */}
          <div className="ml-auto w-full max-w-[88%] rounded-2xl rounded-tr-md bg-brand/[0.07] p-3">
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-fg/[0.06]" />
              ))}
            </div>
            <div className="mt-3 h-11 w-full animate-pulse rounded-xl bg-fg/[0.06]" />
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

// 편집 버튼 — 클릭 시 페이지에 상주하는 PortfolioEditManager로 이벤트를 보낸다.
// (모달/토스트는 매니저가 들고 있어, 타일이 사라져도 작업이 이어진다)
export function EditTrigger({
  photoId,
  albumId,
  className,
}: {
  photoId: string;
  albumId: string | null;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent("samae:edit", { detail: { photoId, albumId } }))
      }
      className={
        className ??
        "rounded-full border border-fg/20 px-3 py-1 text-xs font-medium text-fg/70 transition-colors hover:bg-fg/[0.04]"
      }
    >
      편집
    </button>
  );
}

"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="mt-3.5 h-11 w-full rounded-xl bg-fg text-sm font-semibold text-bg transition-opacity hover:opacity-90"
    >
      인쇄하기
    </button>
  );
}

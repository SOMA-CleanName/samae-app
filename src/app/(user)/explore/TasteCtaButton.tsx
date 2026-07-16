"use client";

// "지금 뜨는 취향" 헤더 옆 CTA — 누르면 맨 아래 취향 테스트 섹션(#sec-taste)으로 스크롤.
// 사매 파트너 작가 뱃지와 같은 톤(소프트 레드 필 + 아이콘 + 끝에 '?').
export function TasteCtaButton() {
  function go() {
    document
      .getElementById("sec-taste")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <button
      type="button"
      onClick={go}
      className="mt-0.5 inline-flex shrink-0 cursor-pointer items-center gap-1 self-center whitespace-nowrap rounded-full bg-brand-soft py-1 pl-2 pr-1.5 text-[11px] font-bold leading-none text-brand-ink transition-transform active:scale-[0.97]"
    >
      당신의 사진 취향은?
      <span
        aria-hidden
        className="grid h-3 w-3 place-items-center rounded-full border border-current text-[7px] font-bold leading-none opacity-70"
      >
        ?
      </span>
    </button>
  );
}

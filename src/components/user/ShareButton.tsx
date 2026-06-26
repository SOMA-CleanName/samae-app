"use client";

import { useState } from "react";

// 사진 공유 — 모바일은 네이티브 공유 시트(navigator.share), 데스크톱 등 미지원은 링크 복사.
export function ShareButton({
  title = "samae — 이 사진 어때요?",
  className = "",
  variant = "default",
}: {
  title?: string;
  className?: string;
  variant?: "default" | "overlay";
}) {
  const [copied, setCopied] = useState(false);
  const tone =
    variant === "overlay"
      ? "bg-black/35 text-white backdrop-blur-sm hover:bg-black/55"
      : "bg-bg/80 text-fg shadow-sm ring-1 ring-line backdrop-blur hover:bg-bg";

  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      return; // 사용자가 공유 취소 — 조용히 무시
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 클립보드 불가 시 무시 */
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      aria-label="공유하기"
      className={[
        "relative grid h-9 w-9 cursor-pointer place-items-center rounded-full transition-colors",
        tone,
        className,
      ].join(" ")}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {copied && (
        <span className="absolute right-0 top-11 whitespace-nowrap rounded-full bg-fg px-2.5 py-1 text-xs font-medium text-bg shadow">
          링크 복사됨
        </span>
      )}
    </button>
  );
}

"use client";

import { useState } from "react";
import { mpTrack } from "@/lib/mixpanel";

// 사진 공유 — 모바일은 네이티브 공유 시트(navigator.share), 데스크톱 등 미지원은 링크 복사.
export function ShareButton({
  title = "samae — 이 사진 어때요?",
  className = "",
  variant = "default",
  photoId,
}: {
  title?: string;
  className?: string;
  variant?: "default" | "overlay";
  photoId?: string;
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
        mpTrack("Share Photo", { photo_id: photoId, method: "native" });
        return;
      }
    } catch {
      return; // 사용자가 공유 취소 — 조용히 무시
    }
    try {
      await navigator.clipboard.writeText(url);
      mpTrack("Share Photo", { photo_id: photoId, method: "clipboard" });
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 클립보드 불가 시 무시 */
    }
  }

  // className 으로 위치를 받으면(absolute 등) 그걸 쓰고, 없을 때만 relative.
  // (base 에 relative 를 박아두면 전달된 absolute 가 Tailwind 순서에 밀려 무시되어
  //  버튼이 in-flow 가 되고 → 같은 박스의 다른 오버레이를 아래로 밀어냄)
  const positioned = /\b(absolute|fixed|relative|sticky)\b/.test(className);

  return (
    <button
      type="button"
      onClick={onShare}
      aria-label="공유하기"
      className={[
        "grid h-9 w-9 cursor-pointer place-items-center rounded-full transition-colors",
        positioned ? "" : "relative",
        tone,
        className,
      ].join(" ")}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {copied && (
        <span
          className={[
            "absolute left-0 whitespace-nowrap rounded-full bg-fg px-2.5 py-1 text-xs font-medium text-bg shadow",
            // overlay(사진 좌하단)면 위로, 기본이면 아래로
            variant === "overlay" ? "bottom-11" : "top-11",
          ].join(" ")}
        >
          링크 복사됨
        </span>
      )}
    </button>
  );
}

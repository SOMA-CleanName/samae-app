"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { mpTrack } from "@/lib/mixpanel";

// 사매 파트너 작가 뱃지 — 사매에 노출되는 작가는 모두 카카오 채널로 직접 인터뷰·선별한 승인 작가.
// 클릭하면 '왜 믿을 수 있는지' 안내 팝오버를 띄운다(전환 직전 신뢰 신호).
export function PartnerBadge({
  className,
  popoverAlign = "right",
}: {
  className?: string;
  popoverAlign?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥 클릭 / Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => {
            if (!o) mpTrack("Open Partner Badge");
            return !o;
          });
        }}
        aria-expanded={open}
        aria-label="사매 파트너 작가 안내"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-soft py-1.5 pl-2.5 pr-2 text-xs font-semibold leading-none text-brand-ink transition-transform active:scale-[0.97]"
      >
        <ShieldCheckIcon className="h-3.5 w-3.5" />
        사매 파트너 작가
        <span
          aria-hidden
          className="grid h-3.5 w-3.5 place-items-center rounded-full border border-current text-[9px] font-bold leading-none opacity-70"
        >
          ?
        </span>
      </button>

      {open && (
        // 배치 위치에 따라 펼치는 방향을 바꾸고, 폭은 뷰포트 안으로 제한한다.
        <div
          role="tooltip"
          className={cn(
            "absolute top-full z-30 mt-2 w-[min(17rem,calc(100vw-2rem))] break-keep rounded-2xl border border-line bg-bg p-3.5 text-left shadow-pop",
            popoverAlign === "left" ? "left-0" : "right-0"
          )}
        >
          <p className="flex items-center gap-1.5 text-body font-semibold text-fg">
            <ShieldCheckIcon className="h-4 w-4 text-brand" />
            사매 파트너 작가
          </p>
          <p className="mt-2 text-body-sm leading-relaxed text-muted">
            사매가 직접 인터뷰하고 심사해 선별한 작가입니다.
          </p>
          <p className="mt-1.5 text-body-sm leading-relaxed text-muted">
            결제는 사매 계좌로 받고, 연락처는 채팅 밖으로 나가지 않습니다.
          </p>

          {/* 한 줄로 끝내면 그건 광고 문구다. 실제 근거를 볼 수 있는 문을 둔다. */}
          <Link
            href="/trust"
            onClick={() => mpTrack("Open Trust Page", { from: "partner_badge" })}
            className="ed-more mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-line bg-surface py-2 text-body-sm font-semibold"
          >
            자세히 보기
            <span aria-hidden className="ed-more-arrow text-[11px]">
              →
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

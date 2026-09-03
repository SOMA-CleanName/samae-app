"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { mpTrack } from "@/lib/mixpanel";

/**
 * 사매 파트너 작가 뱃지.
 *
 * **조건이 없어 보이는 이유** — 호출부는 `!isOwner` 만 본다(photos/[id]). 언뜻 모든 작가에게
 * 붙는 것처럼 읽히지만, 지면에 노출되는 사진은 전부 `photographer.status = 'approved'` 를
 * 통과한 것이다(lib/discovery · siglip-text-search · spots). 즉 **사진 상세에 도달했다는 것
 * 자체가 승인된 작가라는 뜻**이라 별도 조건이 필요 없다. 여기에 조건을 더 붙이려 하지 말 것.
 *
 * **문구는 status/approved_at 이 보증하는 만큼만 적는다.** 예전에 "직접 인터뷰하고 심사해
 * 선별한" 이라고 썼는데, 승인 기록이 보증하는 것은 사매가 심사·승인했다는 사실까지다.
 * 인터뷰 여부는 작가마다 다르고(운영진 본인 계정도 작가로 등록돼 있다) 기록으로 남지 않는다.
 * 지면에서 단언하면 그건 검증할 수 없는 약속이 된다.
 */

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
            사매가 심사해 승인한 작가입니다.
          </p>
          {/*
            ⚠️ dev 판은 여기에 "결제는 사매 계좌로 받고, 연락처는 채팅 밖으로 나가지
               않습니다" 한 줄과 /trust 로 가는 버튼을 둔다. 둘 다 뺐다 —
               그건 에스크로·채팅 상주 모델의 약속인데 이 브랜치의 운영은 리드 판매다.
               **사실이 아닌 것을 지면에 적을 수 없다.** 본배포 때 지면과 함께 되살릴 것.
          */}
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

"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { SlidersIcon, CheckIcon } from "./icons";

// 검색바 우측 보기 옵션 메뉴 — 가격 표시 토글을 품은 드롭다운(구 가격 큰 버튼 대체).
// 가격 상태는 sessionStorage + 커스텀 이벤트로 ExploreGallery 와 동기화. 메인·2단계 공용.
export function SearchOptions() {
  const [open, setOpen] = useState(false);
  const [showPrice, setShowPrice] = useState(false);
  const [showName, setShowName] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowPrice(sessionStorage.getItem("explore:showPrice") === "1");
    setShowName(sessionStorage.getItem("explore:showName") === "1");
  }, []);

  // 바깥 클릭 + 스크롤 시 닫기
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  function togglePrice() {
    const next = !showPrice;
    setShowPrice(next);
    sessionStorage.setItem("explore:showPrice", next ? "1" : "0");
    window.dispatchEvent(new CustomEvent("samae:price-toggle", { detail: next }));
  }

  function toggleName() {
    const next = !showName;
    setShowName(next);
    sessionStorage.setItem("explore:showName", next ? "1" : "0");
    window.dispatchEvent(new CustomEvent("samae:name-toggle", { detail: next }));
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="보기 옵션"
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "grid h-11 w-11 cursor-pointer place-items-center rounded-full transition-colors",
          open || showPrice || showName ? "bg-fg text-bg" : "bg-fg/[0.06] text-fg/70 hover:bg-fg/[0.1]"
        )}
      >
        <SlidersIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-line bg-surface p-1.5 shadow-pop"
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            보기 옵션
          </p>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={showPrice}
            onClick={togglePrice}
            data-track="toggle:price"
            className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-2"
          >
            <span className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-fg/[0.06] text-xs font-bold">
                ₩
              </span>
              <span>
                <span className="block font-medium text-fg">가격 표시</span>
                <span className="block text-xs text-muted">사진 위에 촬영가 노출</span>
              </span>
            </span>
            <Switch on={showPrice} />
          </button>

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={showName}
            onClick={toggleName}
            data-track="toggle:name"
            className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-2"
          >
            <span className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-fg/[0.06] text-xs font-bold">
                @
              </span>
              <span>
                <span className="block font-medium text-fg">작가명 표시</span>
                <span className="block text-xs text-muted">사진 위에 작가 이름 노출</span>
              </span>
            </span>
            <Switch on={showName} />
          </button>
        </div>
      )}
    </div>
  );
}

// 작은 스위치 — 켜짐 시 브랜드, 꺼짐 시 회색 트랙 + 노브 이동
function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors",
        on ? "bg-brand" : "bg-fg/15"
      )}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 translate-x-0.5 items-center justify-center rounded-full bg-white shadow-sm transition-transform",
          on && "translate-x-[18px]"
        )}
      >
        {on && <CheckIcon className="h-3 w-3 text-brand" />}
      </span>
    </span>
  );
}

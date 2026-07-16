"use client";

import { useEffect } from "react";

// 모달·오버레이가 열려 있는 동안 배경(body) 스크롤을 잠근다.
// 여러 모달이 겹쳐도 안전하도록 잠금 카운트를 두어, 마지막 하나가 닫힐 때만 복원한다.
// (모달 내부 스크롤은 각자 overflow-y-auto + overscroll-contain 으로 처리)
let lockCount = 0;
let savedOverflow = "";

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflow = savedOverflow;
    };
  }, [active]);
}

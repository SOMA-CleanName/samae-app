"use client";

import { useEffect, useState } from "react";

// 검색 결과를 불러오는 중인가 — 검색창(SearchPill)이 끝에 도는 표시를 띄운다(사람 요청 2026-10-05).
// 검색창 밖에서 시작한 이동(연관 무드 누르기)도 같은 표시를 쓰도록 창 이벤트로 알린다.
const EVENT = "samae:search-pending";

export function announceSearchPending(pending: boolean) {
  window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: pending }));
}

/** 다른 곳(연관 무드)에서 시작한 검색이 불러오는 중인가 */
export function useSearchPending(): boolean {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const on = (event: Event) => setPending(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return pending;
}

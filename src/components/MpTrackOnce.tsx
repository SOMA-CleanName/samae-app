"use client";

import { useEffect, useRef } from "react";
import { mpTrack } from "@/lib/mixpanel";

// 서버 컴포넌트 페이지에서 Mixpanel 이벤트를 마운트당 1회 발화하기 위한 경량 클라이언트 래퍼.
// (결제 안내 페이지 뷰, 카테고리 랜딩 등 — 클라 로직 없이 뷰만 계측할 때)
export function MpTrackOnce({
  event,
  props,
}: {
  event: string;
  props?: Record<string, unknown>;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    mpTrack(event, props);
    // props 는 마운트 시점 값으로 1회만 — 의도적으로 deps 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { mpTrack } from "@/lib/mixpanel";

// 사진 상세 조회 시 Meta 픽셀 ViewContent 발화 — 중간 깔때기 신호.
// 용도: ① Lead 최적화 학습 신호 보강 ② 리타게팅 모수(사진은 봤지만 문의 안 한 사람) 생성.
// 작가 본인 조회는 noise 라 제외(disabled).
export function PixelViewContent({
  id,
  name,
  photographerId,
  disabled = false,
}: {
  id: string;
  name?: string;
  photographerId?: string;
  disabled?: boolean;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (disabled || fired.current) return;
    fired.current = true;
    window.fbq?.("track", "ViewContent", {
      content_ids: [id],
      content_type: "product",
      content_name: name,
    });
    mpTrack("View Photo", {
      photo_id: id,
      ...(photographerId ? { photographer_id: photographerId } : {}),
    });
  }, [id, name, photographerId, disabled]);
  return null;
}

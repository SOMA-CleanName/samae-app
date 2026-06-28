"use client";

// 상세 프레임 비율(세로가 가장 긴 사진 기준)을 저장 — 재방문 시 로딩 스켈레톤이
// 실제 프레임과 정확히 일치하도록.
import { useEffect } from "react";
import { rememberFrameAspect } from "@/lib/photo-aspect";

export function RememberFrameAspect({ id, aspect }: { id: string; aspect: number }) {
  useEffect(() => {
    rememberFrameAspect(id, aspect);
  }, [id, aspect]);
  return null;
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "../actions";

// 알림 센터 진입 시 1회 모두 읽음 처리 → 사이드바 배지 갱신
export function MarkReadOnMount({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!hasUnread) return;
    markNotificationsRead().then(() => router.refresh());
    // 최초 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

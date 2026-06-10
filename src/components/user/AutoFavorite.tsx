"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toggleFavorite } from "@/app/(user)/actions";

// 로그인 복귀 후(예: ?like=1) 의도했던 좋아요/관심작가를 1회 자동 적용하고 쿼리 제거.
// 멱등: 호출 측이 '아직 안 한 경우'에만 렌더 → 새로고침 재적용 방지(완료 후 path로 replace).
export function AutoFavorite({
  targetType,
  targetId,
  path,
}: {
  targetType: "photo" | "photographer";
  targetId: string;
  path: string;
}) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const fd = new FormData();
    fd.set("targetType", targetType);
    fd.set("targetId", targetId);
    fd.set("path", path);
    toggleFavorite(fd)
      .catch(() => {})
      .finally(() => router.replace(path));
  }, [targetType, targetId, path, router]);

  return null;
}

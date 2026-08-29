"use client";

import { useEffect, useLayoutEffect, useState } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * 컨테이너 폭에 맞춘 메이슨리 컬럼 수 — 탐색 갤러리와 캐스팅 사진 선택이 공유한다.
 * 220px 를 한 컬럼의 목표 폭으로 두고 2~7 컬럼 사이로 제한한다.
 *
 * ready 는 첫 측정이 끝났는지 — 측정 전에 그리면 컬럼 수가 한 번 바뀌며 카드가 튀므로,
 * 호출부에서 ready 전까지 opacity-0 으로 감춘다.
 */
export function useColumnCount(targetWidth = 220, min = 2, max = 7) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(min);
  const [ready, setReady] = useState(false);

  useIsoLayoutEffect(() => {
    if (!node) {
      setReady(false);
      return;
    }
    const compute = () => {
      setCols(Math.max(min, Math.min(max, Math.round(node.clientWidth / targetWidth))));
      setReady(true);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node, targetWidth, min, max]);

  return { cols, ready, setNode };
}

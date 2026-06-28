"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export type StripPhoto = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
};

const GAP = 2; // 타일 사이 아주 미세한 줄(px)
const A_MIN = 0.62; // 극단 비율 클램프 — 너무 세로로 긴 사진이 줄을 과하게 키우지 않게
const A_MAX = 1.7; //  너무 가로로 긴(파노라마) 사진이 줄을 과하게 낮추지 않게

// 저스티파이드 행 — 사진을 원본 비율 그대로(안 잘림) 한 줄에 채운다.
// 한 줄 높이는 균일하고, 각 사진 가로폭은 비율대로 달라 줄을 꽉 채움.
// (박스 비율 = 사진 비율이라 object-cover 여도 잘리지 않는다.)
export function ExploreStrip({ photos }: { photos: StripPhoto[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [targetH, setTargetH] = useState(220);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setW(el.clientWidth);
      setTargetH(window.innerWidth >= 768 ? 300 : 220);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aspectOf = (p: StripPhoto) => {
    const a = p.width > 0 && p.height > 0 ? p.width / p.height : 1;
    return Math.min(A_MAX, Math.max(A_MIN, a));
  };

  // 그리디 패킹 — 한 줄을 타깃 높이까지 채우면 종료(나머지는 버림 → 한 화면 폭에 한 줄).
  const items: { p: StripPhoto; a: number }[] = [];
  if (w > 0) {
    let sum = 0;
    for (const p of photos) {
      const a = aspectOf(p);
      items.push({ p, a });
      sum += a;
      const rowH = (w - GAP * (items.length - 1)) / sum;
      if (rowH <= targetH) break;
    }
  }
  const sumA = items.reduce((s, it) => s + it.a, 0) || 1;
  const rowH = w > 0 ? (w - GAP * (items.length - 1)) / sumA : targetH;

  return (
    <div
      ref={ref}
      className="flex overflow-hidden rounded-2xl bg-fg/[0.05]"
      style={{ gap: GAP, height: rowH }}
    >
      {items.map(({ p, a }) => (
        <div key={p.id} className="relative h-full bg-fg/[0.05]" style={{ width: rowH * a }}>
          <Image
            src={p.thumb_url ?? p.src_url}
            alt=""
            fill
            sizes="(max-width: 768px) 40vw, 24vw"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}

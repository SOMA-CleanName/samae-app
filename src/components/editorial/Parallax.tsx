"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 스크롤 연동 패럴랙스 — 요소가 화면을 지나가는 동안 자식이 천천히 반대로 움직인다.
 *
 * 구현 원칙:
 *   · 리액트 상태를 안 쓴다. 스크롤마다 리렌더가 돌면 긴 페이지에서 바로 끊긴다.
 *   · rAF 로 묶어서 프레임당 한 번만 계산한다.
 *   · 화면 밖이면 계산 자체를 건너뛴다(IntersectionObserver 로 on/off).
 *   · prefers-reduced-motion 이면 아무것도 하지 않는다.
 *
 * speed: 0.1 = 아주 느리게 따라옴 / 0.3 = 뚜렷함. 0.4 넘어가면 멀미가 난다.
 */
export function Parallax({
  children,
  speed = 0.18,
  className = "",
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const box = outer.current;
    const el = inner.current;
    if (!box || !el) return;

    let raf = 0;
    let active = false;

    const update = () => {
      raf = 0;
      const r = box.getBoundingClientRect();
      // 요소 중심이 화면 중심에서 얼마나 벗어났는지(-1 ~ 1)
      const mid = r.top + r.height / 2;
      const d = (mid - window.innerHeight / 2) / (window.innerHeight / 2 + r.height / 2);
      el.style.transform = `translate3d(0, ${(d * speed * 100).toFixed(2)}px, 0)`;
    };
    const onScroll = () => { if (active && !raf) raf = requestAnimationFrame(update); };

    const io = new IntersectionObserver(
      ([e]) => {
        active = e.isIntersecting;
        if (active) update();
      },
      { rootMargin: "120px 0px" }
    );
    io.observe(box);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [speed]);

  return (
    <div ref={outer} className={`overflow-hidden ${className}`}>
      {/* 위아래로 움직여도 빈 곳이 안 생기게 살짝 키워둔다 */}
      <div ref={inner} className="h-[112%] w-full will-change-transform" style={{ marginTop: "-6%" }}>
        {children}
      </div>
    </div>
  );
}

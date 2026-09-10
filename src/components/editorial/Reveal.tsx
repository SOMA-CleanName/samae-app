"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 스크롤 진입 리빌. IntersectionObserver 한 번만 쓰고 해제한다(되돌아올 때 다시 흔들리지 않게).
 *
 * 모션 라이브러리를 쓰지 않는다 — 전환은 globals.css `.ed-reveal` 이 담당하고
 * 여기서는 data-shown 만 켠다. prefers-reduced-motion 도 CSS 쪽에서 처리된다.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 관찰자를 못 쓰는 환경(구형·테스트)에서는 그냥 보여준다 — 콘텐츠가 사라지면 안 된다.
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setShown(true); io.disconnect(); }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-shown={shown}
      className={`ed-reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

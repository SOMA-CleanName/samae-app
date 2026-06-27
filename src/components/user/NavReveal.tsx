"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

// 플로팅 내비 노출 제어.
// forced === null → 항상 보임(기본). forced === boolean → 스크롤 노출 모드(상세페이지).
type NavRevealCtx = {
  forced: boolean | null;
  setForced: (v: boolean | null) => void;
};

const Ctx = createContext<NavRevealCtx>({ forced: null, setForced: () => {} });

export function useNavReveal() {
  return useContext(Ctx);
}

export function NavRevealProvider({ children }: { children: React.ReactNode }) {
  const [forced, setForced] = useState<boolean | null>(null);
  return <Ctx.Provider value={{ forced, setForced }}>{children}</Ctx.Provider>;
}

// 이 마커가 놓인 지점(예: 작가 상세정보 라인)이 화면 상단 50%에 닿으면 내비 노출.
// 진입 시 숨김, 떠날 때 기본(항상 보임)으로 복원.
export function NavRevealOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const { setForced } = useNavReveal();
  const last = useRef<boolean | null>(null);

  useEffect(() => {
    setForced(false);
    last.current = false;
    const check = () => {
      const el = ref.current;
      if (!el) return;
      const v = el.getBoundingClientRect().top < window.innerHeight * 0.5;
      if (v !== last.current) {
        last.current = v;
        setForced(v);
      }
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      setForced(null);
    };
  }, [setForced]);

  return <div ref={ref} aria-hidden className="pointer-events-none h-0 w-0" />;
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// 행동 분석 트래커 — 페이지뷰(라우트 변경) + 전역 클릭(모든 a/button/CTA) 자동 수집.
// 버튼마다 개별 계측 없이 위임 캡처로 "모든 액션"을 잡는다. /api/track 으로 전송.

const SID_KEY = "samae_sid";
const UTM_KEY = "samae_utm";
const LP_KEY = "samae_landing";
const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

type Utm = Partial<Record<(typeof UTM_FIELDS)[number], string>>;

type Ev = {
  type: "pageview" | "click";
  path: string;
  label?: string;
  target?: string;
  referrer?: string | null;
};

function sessionId(): string {
  try {
    let id = localStorage.getItem(SID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SID_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

// UTM/랜딩경로 — 첫 진입 시 캡처해 세션 동안 유지(전환까지 광고 귀속)
function captureAttribution() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const has = UTM_FIELDS.some((f) => sp.get(f));
    if (has) {
      const utm: Utm = {};
      for (const f of UTM_FIELDS) {
        const v = sp.get(f);
        if (v) utm[f] = v.slice(0, 200);
      }
      sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
      sessionStorage.setItem(LP_KEY, window.location.pathname + window.location.search);
    } else if (!sessionStorage.getItem(LP_KEY)) {
      sessionStorage.setItem(LP_KEY, window.location.pathname + window.location.search);
    }
  } catch {
    /* 무시 */
  }
}

function attribution(): { utm: Utm; landing_path: string | null } {
  try {
    const utm = JSON.parse(sessionStorage.getItem(UTM_KEY) || "{}") as Utm;
    return { utm, landing_path: sessionStorage.getItem(LP_KEY) };
  } catch {
    return { utm: {}, landing_path: null };
  }
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const prevPath = useRef<string | null>(null);
  const queue = useRef<Ev[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flush(beacon = false) {
    if (queue.current.length === 0) return;
    const { utm, landing_path } = attribution();
    const body = JSON.stringify({
      sessionId: sessionId(),
      utm,
      landingPath: landing_path,
      events: queue.current,
    });
    queue.current = [];
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    try {
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/track", {
          method: "POST",
          body,
          headers: { "content-type": "application/json" },
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* 무시 — 분석 실패가 UX 를 막지 않게 */
    }
  }

  function enqueue(ev: Ev) {
    queue.current.push(ev);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(false), 1000);
  }

  // 페이지뷰
  useEffect(() => {
    captureAttribution();
    enqueue({ type: "pageview", path: pathname, referrer: prevPath.current });
    prevPath.current = pathname;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // 전역 클릭 캡처 + 떠날 때 flush
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const start = e.target as HTMLElement | null;
      const el = start?.closest?.("a,button,[role=button],[data-track]") as HTMLElement | null;
      if (!el) return;
      const label = (
        el.getAttribute("data-track") ||
        el.getAttribute("aria-label") ||
        el.textContent ||
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 80);
      const target = el.getAttribute("href") || undefined;
      enqueue({
        type: "click",
        path: window.location.pathname,
        label: label || undefined,
        target,
      });
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") flush(true);
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", () => flush(true));
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

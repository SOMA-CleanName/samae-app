"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { mpRegister, mpPeopleOnce, mpTrack } from "@/lib/mixpanel";

// 배포 환경 판별(클라이언트) — 테스트/프리뷰 트래픽을 리포트에서 걸러내기 위한 슈퍼속성.
function appEnv(): "production" | "preview" | "development" {
  try {
    const h = window.location.hostname;
    if (h === "samae.ai" || h === "www.samae.ai") return "production";
    if (h.endsWith(".vercel.app")) return "preview";
  } catch {
    /* 무시 */
  }
  return "development";
}

// 행동 분석 트래커 — 페이지뷰(라우트 변경) + 전역 클릭(모든 a/button/CTA) 자동 수집.
// 버튼마다 개별 계측 없이 위임 캡처로 "모든 액션"을 잡는다.
// 싱크 2곳: 자체 /api/track(세션·전환경로) + Mixpanel(퍼널·리텐션·코호트).

// 측정 제외 — 운영자·작가 페이지는 고객 행동이 아니므로 추적하지 않음
const EXCLUDED = ["/admin", "/studio"];
function isTracked(path: string): boolean {
  return !EXCLUDED.some((p) => path === p || path.startsWith(p + "/"));
}

// 경로 → 페이지 종류(Mixpanel Flows 용). 실제 ID(/photos/<id>) 노이즈 없이
// 종류별로 묶어 'Page View by page_type' 로 유저 흐름을 볼 수 있게 한다.
function pageType(path: string): string {
  if (path === "/" || path === "") return "home";
  if (/^\/explore/.test(path)) return "explore";
  if (/^\/photos\//.test(path)) return "photo";
  if (/^\/photographers\//.test(path)) return "photographer";
  if (/^\/c\//.test(path)) return "category";
  if (/^\/inquiry\/cart/.test(path)) return "inquiry_cart";
  if (/^\/inquiry\/photo/.test(path)) return "inquiry_photo";
  if (/^\/inquiry/.test(path)) return "inquiry";
  if (/^\/favorites/.test(path)) return "favorites";
  if (/^\/my-inquiries/.test(path)) return "my_inquiries";
  if (/^\/bookings/.test(path)) return "bookings";
  if (/^\/chat/.test(path)) return "chat";
  if (/^\/notifications/.test(path)) return "notifications";
  if (/^\/settings/.test(path)) return "settings";
  if (/^\/apply/.test(path)) return "apply";
  if (/^\/login/.test(path)) return "login";
  if (/^\/signup/.test(path)) return "signup";
  if (/^\/privacy/.test(path)) return "privacy";
  return "other";
}

const SID_KEY = "samae_sid";
const UTM_KEY = "samae_utm";
const LP_KEY = "samae_landing";
const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

type Utm = Partial<Record<(typeof UTM_FIELDS)[number], string>>;

type Ev = {
  type: "pageview" | "click" | "scroll";
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
  const maxScreens = useRef(0); // 현재 페이지에서 내려간 최대 화면 수(뷰포트 단위)
  const mpRegistered = useRef(false); // Mixpanel UTM super props 1회 등록

  // 페이지를 떠날 때 그 페이지에서 내려간 최대 화면 수를 1건 기록(무한스크롤 깊이)
  // 단위: '화면'(=뷰포트 1개). %보다 직관적이고 무한스크롤에서 의미가 분명함.
  function flushScroll(path: string | null) {
    const screens = Math.round(maxScreens.current);
    maxScreens.current = 0;
    if (!path || !isTracked(path)) return;
    if (screens >= 1) {
      const capped = Math.min(screens, 99);
      queue.current.push({ type: "scroll", path, label: String(capped) });
      mpTrack("Scroll Depth", { path, screens: capped });
    }
  }

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
    // Mixpanel 병행 전송 (자체 이벤트 타입 → Mixpanel 이벤트명 매핑)
    if (ev.type === "pageview")
      mpTrack("Page View", { path: ev.path, referrer: ev.referrer ?? undefined, page_type: pageType(ev.path) });
    else if (ev.type === "click") mpTrack("Click", { path: ev.path, label: ev.label, target: ev.target });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(false), 1000);
  }

  // 페이지뷰 (어드민·작가 페이지 제외) — 이동 전 이전 페이지의 스크롤 뎁스 기록
  useEffect(() => {
    flushScroll(prevPath.current);
    if (isTracked(pathname)) {
      captureAttribution();
      if (!mpRegistered.current) {
        mpRegistered.current = true;
        const { utm, landing_path } = attribution();
        // 슈퍼속성(이후 모든 이벤트에 첨부) + first-touch 유입원인(people, 최초 1회만)
        mpRegister({ ...utm, landing_path, app_env: appEnv() });
        mpPeopleOnce({
          first_utm_source: utm.utm_source,
          first_utm_medium: utm.utm_medium,
          first_utm_campaign: utm.utm_campaign,
          first_landing_path: landing_path,
        });
      }
      enqueue({ type: "pageview", path: pathname, referrer: prevPath.current });
    }
    prevPath.current = pathname;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // 스크롤 깊이 추적 — 내려간 거리를 '화면 수'(뷰포트 단위)로. 무한스크롤 깊이 측정.
  useEffect(() => {
    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const doc = document.documentElement;
        if (doc.scrollHeight - window.innerHeight < 200) return; // 거의 스크롤 없는 페이지 무시
        const screens = window.innerHeight > 0 ? window.scrollY / window.innerHeight : 0;
        if (screens > maxScreens.current) maxScreens.current = screens;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 의미 이벤트 브리지 — 컴포넌트에서
  //   window.dispatchEvent(new CustomEvent("samae:event", { detail: { label, target?, path? } }))
  // 로 '성공 시점' 전환(문의 접수 등)을 자체 트래커 파이프(+Mixpanel)로 흘려보낸다.
  // 클릭 위임 캡처로는 잡을 수 없는 서버액션 성공 결과를 세션 ID·UTM 과 함께 기록.
  useEffect(() => {
    function onSemantic(e: Event) {
      const d = (e as CustomEvent).detail as { label?: string; target?: string; path?: string } | undefined;
      if (!d?.label) return;
      const path = d.path || window.location.pathname;
      if (!isTracked(path)) return;
      enqueue({ type: "click", path, label: d.label, target: d.target });
      flush(false); // 전환은 유실 방지 위해 즉시 전송
    }
    window.addEventListener("samae:event", onSemantic as EventListener);
    return () => window.removeEventListener("samae:event", onSemantic as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 전역 클릭 캡처 + 떠날 때 flush
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!isTracked(window.location.pathname)) return; // 어드민·작가 페이지 제외
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
    function onLeave() {
      flushScroll(window.location.pathname); // 떠나는 페이지의 스크롤 뎁스 기록
      flush(true);
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") onLeave();
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

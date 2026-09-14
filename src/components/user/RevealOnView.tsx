"use client";

import { useLayoutEffect } from "react";

/**
 * 화면에 들어오면 떠오르는 등장 연출 — **감시자 하나로 지면 전체를 맡는다.**
 *
 * 쓰는 법: 올라올 요소에 `data-reveal` 을 붙이고, 지면 어딘가에 이 컴포넌트를 한 번 둔다.
 * 순서를 주고 싶으면 `style={{ "--rd": 90 }}` 처럼 지연(ms)을 넘긴다.
 *
 * 감싸는 태그를 만들지 않는 이유: 매거진 섹션들은 `scroll-mt`·`id` 로 러닝헤드와
 * 엮여 있어서, 중간에 div 를 끼우면 그 계산이 어긋난다.
 *
 * ⚠️ CSS(`globals.css`)에서 숨김은 **`[data-reveal-on]` 아래에서만** 걸린다.
 *    이 컴포넌트가 실제로 감시자를 설치한 뒤에 그 표식을 붙인다 —
 *    IntersectionObserver 가 없는 환경에서 지면이 통째로 사라지지 않게 하려는 것이다.
 *
 * ⚠️ **이미 화면에 있는 요소는 감시자가 안 깨운다.** IntersectionObserver 는 교차
 *    상태가 *바뀔 때* 부르는데, 마운트 시점에 이미 들어와 있던 것은 다시 들어올 일이
 *    없다. 그대로 두면 첫 화면이 통째로 `opacity:0` 로 남는다(피드에서 겪은 일 —
 *    ExploreGallery 주석). 그래서 설치 직후 한 번 훑어서 기준선을 넘은 건 바로 켠다.
 */
export function RevealOnView() {
  useLayoutEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])")
    );
    if (nodes.length === 0) return;

    const root = document.documentElement;
    root.setAttribute("data-reveal-on", "");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.shown = "1";
          io.unobserve(e.target);
        }
      },
      // 화면에 닿기 직전 시작한다. 음수로 두면 스크롤을 멈춘 순간 맨 아래 요소가
      // 선을 못 넘어 숨은 채 남는다(피드에서 그렇게 빈칸이 생겼다).
      { rootMargin: "0px 0px 6% 0px", threshold: 0.01 }
    );

    nodes.forEach((n) => io.observe(n));

    // 설치 시점에 이미 기준선을 넘은 것들은 즉시 켠다(위 주석 ②)
    const line = window.innerHeight * 1.06;
    nodes.forEach((n) => {
      if (n.getBoundingClientRect().top < line) {
        n.dataset.shown = "1";
        io.unobserve(n);
      }
    });

    return () => {
      io.disconnect();
      // 표식을 지운다 — 감시자 없는 다음 지면에서 요소가 숨은 채 굳으면 안 된다
      root.removeAttribute("data-reveal-on");
    };
  }, []);

  return null;
}

"use client";

import { useEffect, useState } from "react";

/*
  치수는 좁은 기기 기준으로 잡았다.
  375px 화면에서 알약(280px)이 가운데 서면 양옆에 47px 밖에 안 남는다.
  40px 버튼 + 8px 간격이면 48px 라 알약에 붙어버려서, 36px + 6px 로 줄였다.
*/
const BTN = 36; // 버튼 지름(px)
const GAP = 6; // 알약과의 간격
const EDGE = 4; // 화면 오른쪽 끝에 남길 여백

/**
 * 맨 위로 — 전체 사진 구간에 들어서면 나타난다.
 *
 * 무한스크롤이라 한참 내려가면 돌아올 방법이 없다. 브라우저 위로 스와이프도
 * 주소창을 부르지 페이지를 올려주지는 않는다.
 *
 * 기준점(anchorId)이 화면 위로 지나간 뒤부터만 뜬다. 스크롤 값으로 재면
 * 기기·폰트 크기에 따라 나타나는 지점이 제각각이라, 실제 지면 위치로 잡는다.
 *
 * 스크롤 리스너를 두지 않고 관찰자를 쓴다 — 스크롤마다 상태를 바꾸면
 * 피드가 긴 화면에서 렌더가 계속 돈다.
 */
export function ScrollTopButton({ anchorId }: { anchorId: string }) {
  const [show, setShow] = useState(false);
  // 알약 오른쪽 끝 + 간격. 재기 전에는 화면 밖에 두어 깜빡임을 막는다.
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const el = document.getElementById(anchorId);
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      ([e]) => {
        // 기준점이 화면 위로 넘어갔을 때만 노출 (아래에 있을 땐 아직 안 왔다)
        setShow(!e.isIntersecting && e.boundingClientRect.top < 0);
      },
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [anchorId]);

  /*
    바텀 플로팅 바(홈/탐색 알약)의 오른쪽에 붙인다.

    알약은 화면 가운데 고정이고 폭은 탭 수에 따라 달라진다. 그래서 화면 오른쪽에
    고정값으로 두면 넓은 기기에서는 멀찍이 떨어지고 좁은 기기에서는 알약을 덮는다.
    실제 오른쪽 끝을 재서 그 옆에 세우고, 화면 밖으로 나가지 않게 가둔다.
  */
  useEffect(() => {
    const place = () => {
      const nav = document.querySelector("[data-floating-nav]");
      if (!nav) return;
      const r = nav.getBoundingClientRect();
      const maxLeft = window.innerWidth - BTN - EDGE;
      setLeft(Math.min(r.right + GAP, maxLeft));
    };

    place();
    window.addEventListener("resize", place);
    // 알약은 스크롤 방향에 따라 숨었다 나타나며 폭이 바뀔 수 있다.
    const mo = new MutationObserver(place);
    const nav = document.querySelector("[data-floating-nav]");
    if (nav) mo.observe(nav, { attributes: true, childList: true, subtree: true });

    return () => {
      window.removeEventListener("resize", place);
      mo.disconnect();
    };
  }, []);

  return (
    <button
      type="button"
      aria-label="맨 위로"
      // 안 보일 땐 완전히 빼둔다 — 투명하게만 두면 하단 내비 위에서 헛클릭이 난다
      hidden={!show || left === null}
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        })
      }
      className="stt fixed bottom-5 z-40 grid h-9 w-9 place-items-center rounded-full bg-bg/95 text-fg shadow-lg ring-1 ring-line backdrop-blur"
      /* 알약과 같은 높이(bottom-5)·같은 표면 처리. 한 줄에 나란히 앉게. */
      style={{ left: left ?? -9999 }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}

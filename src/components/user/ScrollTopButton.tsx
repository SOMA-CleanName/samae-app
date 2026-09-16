"use client";

import { useEffect, useState } from "react";

const BTN = 36; // 버튼 지름(px)
/** 화면 오른쪽 끝에 남길 여백 — 지면 가로 패딩(px-2.5 = 10)과 맞춘다 */
const EDGE = 10;

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
  // 바텀바와 맞출 세로 중심. 재기 전에는 화면 밖에 두어 깜빡임을 막는다.
  const [top, setTop] = useState<number | null>(null);

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
    **화면 오른쪽 끝**에 붙이고, 세로 중심만 바텀바와 맞춘다.

    전에는 알약의 오른쪽 끝을 재서 그 옆에 세웠다. 알약 폭이 탭 수에 따라 달라져서
    버튼 자리도 같이 움직였고, 그러다 보니 화면 어디에도 속하지 않은 어중간한 위치가
    됐다(정훈 2026-09-12: "위치가 조금 애매하네").

    가로는 고정(오른쪽 끝)이 맞다 — 알약은 엄지가 닿는 가운데, 이건 보조 동작이라
    구석. 세로만 알약과 같은 선에 두어 둘이 한 줄로 읽히게 한다.

    `bottom` 을 같이 쓰면 버튼(36)과 알약(약 48) 높이가 달라 밑선만 맞고 가운데가
    어긋난다. 알약의 세로 **중심**을 재서 거기에 맞춘다.
  */
  useEffect(() => {
    const place = () => {
      const nav = document.querySelector("[data-floating-nav]");
      if (!nav) return;
      const r = nav.getBoundingClientRect();
      setTop(r.top + (r.height - BTN) / 2);
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
      hidden={!show || top === null}
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        })
      }
      className="stt fixed z-40 grid h-9 w-9 place-items-center rounded-full bg-bg/95 text-fg shadow-lg ring-1 ring-line backdrop-blur before:absolute before:-inset-1 before:content-['']"
      /* 알약과 같은 표면 처리. 가로는 오른쪽 끝 고정, 세로만 알약 중심에 맞춘다. */
      style={{ right: EDGE, top: top ?? -9999 }}
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

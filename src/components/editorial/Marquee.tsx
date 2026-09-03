import type { ReactNode } from "react";

/**
 * 흐르는 띠 — 잡지 표지의 러닝 헤드 같은 장치.
 *
 * 서버 컴포넌트다. CSS 만으로 도는 애니메이션이라 JS 가 필요 없다.
 * 같은 내용을 두 번 깔고 -50% 까지 밀면 이음매가 안 보인다.
 */
export function Marquee({
  children,
  speed = 28,
  reverse = false,
  className = "",
}: {
  children: ReactNode;
  /** 한 바퀴에 걸리는 초. 클수록 느리다. */
  speed?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div className={`ed-marquee overflow-hidden ${className}`} aria-hidden>
      <div
        className="ed-marquee-track flex w-max items-center"
        style={{
          animationDuration: `${speed}s`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center">{children}</div>
      </div>
    </div>
  );
}

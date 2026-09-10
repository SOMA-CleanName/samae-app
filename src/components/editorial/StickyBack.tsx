"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { canGoBackInApp } from "@/lib/in-app-nav";

/**
 * 지면 상단 뒤로가기 바 — 스크롤해도 화면 위에 붙어 있는다.
 *
 * 온 곳으로 돌아간다. 다만 **온 곳이 우리 페이지일 때만.**
 *   · 앱 안에서 들어왔으면 → history.back() (홈 피드에서 글로 들어왔으면 피드로)
 *   · 검색·AI 인용으로 바로 들어왔으면 → href 로 (뒤는 구글이지 우리가 아니다)
 *
 * 처음엔 무조건 상위 지면 고정 링크였는데, 그러면 홈 피드에서 읽을거리를 눌러 들어온
 * 사람이 뒤로가기에서 글 목록으로 떨어졌다. 온 곳이 홈인데 말이다.
 * 판정 근거는 lib/in-app-nav 에 적어 뒀다.
 *
 * 링크(<a>)로 그려 두고 클릭만 가로챈다 — 상태도 이펙트도 없어서 하이드레이션 후
 * 라벨이 바뀌거나 깜빡이지 않고, JS 가 죽어도 링크는 그대로 동작한다.
 * 크롤러도 이 링크를 따라간다.
 *
 * 글을 다 읽고 고개를 들었을 때 나갈 문이 화면 안에 있어야 해서 sticky 로 둔다.
 * (조상에 transform 이 걸리면 sticky 가 죽는다 — 이 지면들은 (user) 그룹 밖이라
 *  page-enter 템플릿의 영향을 받지 않는다.)
 */
export function StickyBack({
  href,
  label = "뒤로",
  meta,
  maxWidth = "880px",
}: {
  /** 앱 밖에서 바로 들어왔을 때 갈 곳(상위 지면). */
  href: string;
  /** 기본은 "뒤로" — 실제 목적지가 상황에 따라 달라지므로 목적지 이름을 쓰지 않는다. */
  label?: string;
  /** 오른쪽 작은 글씨 — 지금 어느 지면인지. 없으면 비워 둔다. */
  meta?: string;
  maxWidth?: string;
}) {
  const router = useRouter();

  return (
    <div className="sticky top-0 z-40 border-b border-line bg-bg/88 backdrop-blur-md">
      <div
        className="mx-auto flex h-12 items-center gap-3 px-4 sm:px-6"
        style={{ maxWidth }}
      >
        <Link
          href={href}
          onClick={(e) => {
            // 새 탭/새 창으로 여는 클릭은 건드리지 않는다
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            if (!canGoBackInApp()) return;
            e.preventDefault();
            router.back();
          }}
          className="ed-back group -ml-1 inline-flex min-w-0 items-center gap-1.5 rounded-full py-1.5 pl-1 pr-2.5 text-body-sm font-semibold tracking-tight text-fg transition-colors hover:text-brand"
        >
          <span
            aria-hidden
            className="ed-back-arrow grid h-6 w-6 shrink-0 place-items-center text-[15px] leading-none"
          >
            ←
          </span>
          <span className="truncate">{label}</span>
        </Link>
        {meta && (
          <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
            {meta}
          </span>
        )}
      </div>
    </div>
  );
}

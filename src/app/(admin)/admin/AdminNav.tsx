"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { GROUPS, matchTab } from "@/lib/admin-nav";

/*
  어드민 내비 — 2단(그룹 → 그 그룹의 페이지).

  ⚠️ 전에는 **탭 23개가 한 줄**이었다. 모바일에서는 가로 스크롤이라 오른쪽 끝이 보이지
     않았고, 데스크톱에서는 wrap 돼 sticky 헤더가 화면을 크게 먹었다. 어느 쪽이든
     "무엇이 어디 있는지" 를 외워야 썼다.

     그룹 라벨만 끼워 한 줄로 펼치는 것도 생각했는데 헤더가 더 커진다 — sticky 라
     그만큼 본문이 밀린다. 그래서 2단이다. 다른 그룹의 페이지는 한 번 더 눌러야 하지만
     23개 중에서 눈으로 찾는 것보다 빠르다.

  페이지 목록은 lib/admin-nav 에 있다 — 거기에만 더하면 된다.
*/

export function AdminNav() {
  const pathname = usePathname();
  const match = matchTab(pathname);
  // 어디에도 안 걸리는 주소(페이지를 만들고 여기 안 넣었을 때)에서도 내비는 떠야 한다
  const activeGroup = match?.group ?? GROUPS[0];

  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-5">
      {/* ① 그룹 */}
      <nav aria-label="어드민 영역" className="flex gap-1 overflow-x-auto scrollbar-none">
        {GROUPS.map((g) => {
          const active = g.key === activeGroup.key;
          return (
            <Link
              key={g.key}
              href={g.tabs[0].href}
              aria-current={active ? "true" : undefined}
              className={cn(
                "shrink-0 rounded-t-lg px-3 py-2 text-body-sm font-semibold transition-colors",
                active ? "text-fg" : "text-faint hover:text-muted"
              )}
            >
              {g.label}
            </Link>
          );
        })}
      </nav>

      {/* ② 그 그룹의 페이지 */}
      <nav
        aria-label={`${activeGroup.label} 페이지`}
        className="flex gap-1 overflow-x-auto scrollbar-none"
      >
        {activeGroup.tabs.map((t) => {
          const active = t.href === match?.tab.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2.5 text-body-sm font-medium transition-colors",
                active ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

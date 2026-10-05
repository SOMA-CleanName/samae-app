"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// 첫 줄은 일이 다른 것끼리만 나눈다 — 목적 분류와 무드 어휘(D0~D5)는 서로 다른 일이다(사람 결정, 2026-09-29).
// 무드 안의 층(검색어 · 묶음 · 무리 · 이웃 · 가족)은 둘째 줄 MoodLayerNav 로 내렸다.
// 사진 태그(사진마다 붙인 가족 · 큰 무드, docs/47)는 어휘를 만드는 일과 달라 따로 둔다(사람 요청 2026-10-01).
const pages = [
  { href: "/admin/photo-purpose", label: "목적" },
  { href: "/admin/photo-purpose/mood", label: "무드" },
  { href: "/admin/photo-purpose/tags", label: "사진 태그" },
  { href: "/admin/photo-purpose/search-probe", label: "검색 점수" },
];

export function PhotoClassificationNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="사진 분류" className="mt-4 flex gap-1 border-b border-border">
      {pages.map(({ href, label }) => {
        // 가장 깊게 맞는 항목 하나만 켠다 — /mood/... 에서 '목적'까지 같이 켜지면 안 된다.
        const match = (candidate: string) => pathname === candidate || pathname.startsWith(`${candidate}/`);
        const deepest = pages.filter(({ href: candidate }) => match(candidate)).sort((a, b) => b.href.length - a.href.length)[0];
        const active = deepest?.href === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-5 py-3 text-body-sm font-semibold transition-colors",
              active ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

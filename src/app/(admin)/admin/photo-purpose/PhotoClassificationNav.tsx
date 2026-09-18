"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const pages = [
  { href: "/admin/photo-purpose", label: "목적" },
  { href: "/admin/photo-purpose/mood", label: "무드" },
  { href: "/admin/photo-purpose/mood/axes", label: "축 배정" },
  { href: "/admin/photo-purpose/mood/terms", label: "검색어 정리" },
  { href: "/admin/photo-purpose/mood/neighbors", label: "이웃 그래프" },
  { href: "/admin/photo-purpose/search-probe", label: "검색 점수" },
  // 임시 검수 화면. 무드 그래프가 확정되면 없앤다.
  { href: "/admin/photo-purpose/mood/review", label: "무드 검수" },
];

export function PhotoClassificationNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="사진 분류" className="mb-6 mt-4 flex gap-1 border-b border-border">
      {pages.map(({ href, label }) => {
        // 가장 깊게 맞는 항목 하나만 켠다 — /mood/review 에서 '무드'까지 같이 켜지면 안 된다.
        const match = (candidate: string) =>
          pathname === candidate || pathname.startsWith(`${candidate}/`);
        const deepest = pages
          .filter(({ href: candidate }) => match(candidate))
          .sort((a, b) => b.href.length - a.href.length)[0];
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** 사진 태그의 둘째 줄 — 태그 관리(가족 · 큰 무드별 검수) · 사진별 태그(사진 한 장씩 구경) · 신규 사진(새로 올라온 사진 검수) (docs/47 §5 · §6) */
const T = "/admin/photo-purpose/tags";
const TABS = [
  { href: T, label: "태그 관리" },
  { href: `${T}/photos`, label: "사진별 태그" },
  { href: `${T}/new`, label: "신규 사진" },     // 새로 올라온 사진의 무드 태그 검수(docs/47 §6, 2026-10-05)
];

export function TagsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="사진 태그" className="mb-6 flex flex-wrap gap-1.5 border-b border-border pb-3 pt-3">
      {TABS.map((tab) => {
        const active = tab.href === T ? pathname === T : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}
            className={cn("rounded-xl border px-3.5 py-2 text-body-sm transition-colors",
              active ? "border-brand bg-brand/10 font-semibold text-brand" : "border-line text-muted hover:border-fg/40 hover:text-fg")}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

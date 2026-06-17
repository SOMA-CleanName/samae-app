"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// 어드민 상단 탭 내비 — 활성 경로 강조. 페이지 추가 시 여기에 항목만 더하면 됨.
const TABS = [
  { href: "/admin", label: "대시보드", exact: true },
  { href: "/admin/photographers", label: "작가 승인" },
  { href: "/admin/transactions", label: "거래·정산" },
  { href: "/admin/users", label: "회원" },
  { href: "/admin/inquiries", label: "문의" },
  { href: "/admin/categories", label: "카테고리" },
  { href: "/admin/tags", label: "태그" },
  { href: "/admin/analytics", label: "분석" },
];

export function AdminNav() {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 scrollbar-none sm:px-5">
      {TABS.map((t) => {
        const active = isActive(t.href, t.exact);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-body-sm font-medium transition-colors",
              active
                ? "border-fg text-fg"
                : "border-transparent text-muted hover:text-fg"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

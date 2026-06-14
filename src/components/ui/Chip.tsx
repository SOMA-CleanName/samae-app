import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// 선택형 칩 — 필터·태그(가로 스크롤 영역). selected 토글.
export function Chip({
  selected,
  className,
  children,
  ...props
}: Omit<ComponentProps<"button">, "className"> & {
  selected?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
        selected
          ? "bg-fg text-bg"
          : "bg-fg/[0.06] text-fg/70 hover:bg-fg/[0.1] hover:text-fg",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// 빈 상태 — 목록·검색·찜 결과 없음. 아이콘 + 제목 + 설명 + 선택적 액션.
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-fg/[0.05] text-fg/40">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold text-fg">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

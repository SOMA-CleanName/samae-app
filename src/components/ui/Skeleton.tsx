import { cn } from "@/lib/cn";

// 스켈레톤 — 비동기 콘텐츠 자리표시(레이아웃 점프 방지).
// prefers-reduced-motion 시 globals.css 가 pulse 를 정지시킴.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-lg bg-fg/[0.07]", className)}
    />
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// 상태 배지 — 예약 단계·신청 상태 등. 색 = 의미.
type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

// ⚠️ 틴트(`-soft`) 위에는 반드시 `-ink` 를 얹는다. 채움색(`text-success` 등)은 **흰 글자를
//    받으려고 어둡게 유지되는 색**이라, 다크모드에서 어두워진 틴트 위에 그대로 쓰면 배경과
//    붙는다(실측 2.75:1 — AA 4.5 미달). globals.css 가 그래서 `-ink` 를 따로 둔다.
//    brand 만 규칙을 지키고 있었고 나머지 넷이 새고 있었다.
const TONES: Record<Tone, string> = {
  neutral: "bg-fg/[0.06] text-fg/70",
  brand: "bg-brand-soft text-brand-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  info: "bg-info-soft text-info-ink",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-none",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

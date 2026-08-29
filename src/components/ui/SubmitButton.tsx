"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./Button";

// 서버액션 폼 제출 버튼 — 제출 중 자동 비활성화 + 로딩 텍스트(반응 없어 보이는 문제 방지).
// 폼(<form action={serverAction}>) 의 자식으로 두면 useFormStatus 로 pending 을 자동 감지한다.
export function SubmitButton({
  children,
  pendingText = "처리 중…",
  className,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} aria-label={ariaLabel} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}

// 디자인 시스템 ui/Button 을 쓰는 서버액션 폼 제출 버튼 — 제출 중 스피너/비활성.
export function PendingButton({
  children,
  variant,
  size,
  fullWidth,
  className,
  disabled,
}: {
  children: React.ReactNode;
  variant?: "primary" | "brand" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
  /** 제출 자체를 막아야 할 때 (예: 조건 미충족으로 눌러도 서버에서 거부되는 액션) */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      loading={pending}
      disabled={disabled}
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      className={className}
    >
      {children}
    </Button>
  );
}

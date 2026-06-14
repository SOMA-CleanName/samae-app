import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const FIELD_BASE =
  "w-full rounded-xl border bg-surface text-fg text-sm placeholder:text-faint " +
  "outline-none transition-colors " +
  "focus:border-fg/40 focus:ring-2 focus:ring-fg/10 " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20";

// 텍스트 입력 — 44px 터치 타겟(h-11). leftIcon 옵션.
export function Input({
  className,
  leftIcon,
  invalid,
  ...props
}: Omit<ComponentProps<"input">, "className"> & {
  className?: string;
  leftIcon?: ReactNode;
  invalid?: boolean;
}) {
  if (leftIcon) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint">
          {leftIcon}
        </span>
        <input
          aria-invalid={invalid || undefined}
          className={cn(FIELD_BASE, "h-11 pl-10 pr-4", className)}
          {...props}
        />
      </div>
    );
  }
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(FIELD_BASE, "h-11 px-4", className)}
      {...props}
    />
  );
}

// 여러 줄 입력
export function Textarea({
  className,
  invalid,
  ...props
}: Omit<ComponentProps<"textarea">, "className"> & {
  className?: string;
  invalid?: boolean;
}) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(FIELD_BASE, "min-h-24 px-4 py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

// 라벨 + 도움말/에러를 묶는 필드 래퍼
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
          {label}
          {required && <span className="ml-0.5 text-brand">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

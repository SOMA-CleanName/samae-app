import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

// 버튼 변형/크기 — 디자인 시스템 토큰만 사용 (docs/14-design-system.md)
type Variant = "primary" | "brand" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // 기본 1차 액션 — 잉크(검정) 채움
  primary: "bg-fg text-bg hover:bg-fg/90 active:bg-fg/80",
  // 강조 액션 — 브랜드 레드 (예약·문의 등 전환 CTA)
  brand: "bg-brand text-white hover:bg-brand/90 active:bg-brand/80",
  // 보조 액션 — 외곽선
  secondary: "border border-line-strong bg-surface text-fg hover:bg-surface-2 active:bg-line/60",
  // 약한 액션 — 배경 없음
  ghost: "text-fg/75 hover:bg-fg/[0.06] hover:text-fg active:bg-fg/[0.1]",
  // 파괴적 액션
  danger: "bg-danger text-white hover:bg-danger/90 active:bg-danger/80",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-lg",      // 보조용 (44px 미만 — 밀집 영역만)
  md: "h-11 px-5 text-sm gap-2 rounded-xl",          // 기본 — 44px 터치 타겟
  lg: "h-12 px-6 text-base gap-2 rounded-xl",        // 주요 CTA
};

const BASE =
  "inline-flex select-none items-center justify-center font-semibold whitespace-nowrap " +
  "transition-colors duration-200 cursor-pointer " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
};

// href 가 있으면 <Link>, 없으면 <button> 으로 렌더.
type ButtonProps = CommonProps &
  Omit<ComponentProps<"button">, "className" | "children"> & { href?: undefined };
type LinkButtonProps = CommonProps &
  Omit<ComponentProps<typeof Link>, "className" | "children"> & { href: string };

export function Button(props: ButtonProps | LinkButtonProps) {
  const {
    variant = "primary",
    size = "md",
    fullWidth,
    loading,
    leftIcon,
    rightIcon,
    className,
    children,
    ...rest
  } = props;

  const classes = cn(
    BASE,
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className
  );

  const content = (
    <>
      {loading ? <Spinner className="h-4 w-4" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </>
  );

  if ("href" in props && props.href !== undefined) {
    const { href, ...linkRest } = rest as ComponentProps<typeof Link>;
    return (
      <Link href={href} className={classes} aria-busy={loading} {...linkRest}>
        {content}
      </Link>
    );
  }

  const { disabled, ...btnRest } = rest as ComponentProps<"button">;
  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading}
      {...btnRest}
    >
      {content}
    </button>
  );
}

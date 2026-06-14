import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const BASE = "rounded-2xl border border-line bg-surface";

// 표면 카드 — href 주면 클릭 가능한 카드(hover 강조 + cursor-pointer)
export function Card({
  href,
  interactive,
  className,
  children,
  ...rest
}: {
  href?: string;
  interactive?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<"div">, "className" | "children">) {
  const hoverable = interactive || href !== undefined;
  const classes = cn(
    BASE,
    hoverable &&
      "cursor-pointer transition-colors hover:border-line-strong hover:bg-surface-2 " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    className
  );

  if (href !== undefined) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

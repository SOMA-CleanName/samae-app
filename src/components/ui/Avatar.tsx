/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/cn";

const SIZES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-2xl",
} as const;

// 아바타 — 이미지 없으면 이니셜 폴백
export function Avatar({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-fg font-bold text-bg",
        SIZES[size],
        className
      )}
    >
      {src ? (
        <img src={src} alt={name ? `${name} 프로필` : ""} className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}

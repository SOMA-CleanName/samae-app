"use client";

import Link from "next/link";
import { mpTrack } from "@/lib/mixpanel";

// 탐색 홈 카테고리 섹션 클릭 추적 — 어떤 카테고리를, 피드 몇 번째에서 눌렀는지.
// (Mixpanel: "Click Explore Category" 를 category/rank 로 쪼개 반응 순위 확인)
export function TrackedCategoryLink({
  href,
  category,
  slug,
  rank,
  className,
  children,
}: {
  href: string;
  category: string;
  slug: string;
  rank: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => mpTrack("Click Explore Category", { category, slug, rank })}
    >
      {children}
    </Link>
  );
}

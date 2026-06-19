"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { PortfolioGrid, type PortfolioPost } from "./PortfolioGrid";

export type ProfilePkg = {
  id: string;
  name: string;
  description: string | null;
  price_krw: number;
  duration_min: number;
  edited_count: number;
};

const fmt = new Intl.NumberFormat("ko-KR");

// 작가 프로필 본문 — 포트폴리오 / 촬영 패키지를 탭으로 전환해 본다.
export function ProfileTabs({
  posts,
  packages,
  viewer,
}: {
  posts: PortfolioPost[];
  packages: ProfilePkg[];
  viewer: { isOwner: boolean; photographerId: string };
}) {
  const [tab, setTab] = useState<"portfolio" | "packages">("portfolio");

  return (
    <div>
      {/* 탭 바 */}
      <div className="flex gap-6 border-b border-line">
        <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>
          포트폴리오
        </TabButton>
        <TabButton active={tab === "packages"} onClick={() => setTab("packages")}>
          촬영 패키지
          {packages.length > 0 && <span className="ml-1 text-faint">{packages.length}</span>}
        </TabButton>
      </div>

      {/* 탭 내용 */}
      <div className="mt-5">
        {tab === "portfolio" ? (
          posts.length > 0 ? (
            <PortfolioGrid posts={posts} viewer={viewer} />
          ) : (
            <p className="py-16 text-center text-body-sm text-muted">아직 공개된 포트폴리오가 없어요.</p>
          )
        ) : packages.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {packages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} viewer={viewer} />
            ))}
          </ul>
        ) : (
          <p className="py-16 text-center text-body-sm text-muted">아직 등록된 패키지가 없어요.</p>
        )}
      </div>
    </div>
  );
}

function PackageCard({
  pkg,
  viewer,
}: {
  pkg: ProfilePkg;
  viewer: { isOwner: boolean; photographerId: string };
}) {
  const content = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-body font-semibold">{pkg.name}</p>
        <p className="shrink-0 text-body font-semibold">₩{fmt.format(pkg.price_krw)}</p>
      </div>
      {pkg.description && (
        <p className="mt-1 text-body-sm text-muted">{pkg.description}</p>
      )}
      <p className="mt-1.5 text-caption text-faint">
        {pkg.duration_min}분 · 보정본 {pkg.edited_count}장
      </p>
    </>
  );

  if (viewer.isOwner) {
    return <li className="rounded-2xl border border-line bg-surface p-4">{content}</li>;
  }

  return (
    <li>
      <Link
        href={`/inquiry?photographerId=${encodeURIComponent(viewer.photographerId)}`}
        className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-fg/25 hover:bg-surface-2"
      >
        {content}
      </Link>
    </li>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px cursor-pointer border-b-2 pb-2.5 text-body-sm transition-colors",
        active ? "border-fg font-semibold text-fg" : "border-transparent text-muted hover:text-fg"
      )}
    >
      {children}
    </button>
  );
}

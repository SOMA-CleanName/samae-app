"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { mpTrack } from "@/lib/mixpanel";
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

// 작가 프로필 본문 — 소개 / 포트폴리오 / 촬영 패키지를 탭으로 전환해 본다.
// 소개(무드) 섹션은 서버에서 렌더한 노드를 aboutSlot 으로 받는다. 섹션 없으면 탭 자체를 숨김.
export function ProfileTabs({
  aboutSlot,
  posts,
  packages,
  viewer,
}: {
  aboutSlot?: React.ReactNode;
  posts: PortfolioPost[];
  packages: ProfilePkg[];
  viewer: { isOwner: boolean; photographerId: string };
}) {
  const hasAbout = !!aboutSlot;
  const [tab, setTab] = useState<"about" | "portfolio" | "packages">(
    hasAbout ? "about" : "portfolio"
  );
  const pkgViewFired = useRef(false);

  // 작가 프로필 조회 — 본인 조회는 noise 라 제외. 마운트당 1회.
  const viewFired = useRef(false);
  useEffect(() => {
    if (viewer.isOwner || viewFired.current) return;
    viewFired.current = true;
    const prices = packages.map((p) => p.price_krw).filter((n) => n > 0);
    mpTrack("View Photographer", {
      photographer_id: viewer.photographerId,
      package_count: packages.length,
      post_count: posts.length,
      ...(prices.length ? { min_price_krw: Math.min(...prices) } : {}),
    });
  }, [viewer.isOwner, viewer.photographerId, packages, posts.length]);

  return (
    <div>
      {/* 탭 바 */}
      <div className="flex gap-6 border-b border-line">
        {hasAbout && (
          <TabButton active={tab === "about"} onClick={() => setTab("about")}>
            소개
          </TabButton>
        )}
        <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>
          포트폴리오
        </TabButton>
        <TabButton
          active={tab === "packages"}
          onClick={() => {
            setTab("packages");
            // 패키지 탭 첫 열람 — 예약 직전 관심 신호(퍼널 이탈지점)
            if (!pkgViewFired.current) {
              pkgViewFired.current = true;
              mpTrack("View Packages", {
                photographer_id: viewer.photographerId,
                package_count: packages.length,
              });
            }
          }}
        >
          촬영 패키지
          {packages.length > 0 && <span className="ml-1 text-faint">{packages.length}</span>}
        </TabButton>
      </div>

      {/*
        탭 내용.

        🔴 **글이 있는 탭은 항상 그린다.** 전에는 활성 탭만 마운트했는데, 기본 탭이
           포트폴리오(=사진)라 **소개와 패키지 글이 초기 HTML 에 아예 없었다.**
           실측 2026-09-26: 작가 지면 본문 61단어, 패키지 이름·설명은 RSC 페이로드
           안에만 있었다. JS 를 돌리지 않는 크롤러(AI 봇 상당수)는 "촬영 패키지 2" 에서
           끝났다. 작가 25명 중 22명이 소개글을, 패키지 52개 중 48개가 설명을 써 뒀는데
           그게 한 글자도 안 나가고 있었다.

           `hidden` 으로 감추기만 한다 — 사람이 보는 화면은 그대로고, 문서에는 남는다.

        포트폴리오는 그대로 조건부다. 사진이라 글로 얻을 게 없고, 그리드를 늘 마운트하면
        무겁다.
      */}
      <div className="mt-5">
        {hasAbout && <div hidden={tab !== "about"}>{aboutSlot}</div>}
        {tab === "portfolio" &&
          (posts.length > 0 ? (
            <PortfolioGrid posts={posts} viewer={viewer} />
          ) : (
            <p className="py-16 text-center text-body-sm text-muted">아직 공개된 포트폴리오가 없어요.</p>
          ))}
        <div hidden={tab !== "packages"}>
          {packages.length > 0 ? (
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
        href={`/inquiry/bot?photographerId=${encodeURIComponent(viewer.photographerId)}`}
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
        // 밑줄 위치(pb-2.5)는 그대로. 위쪽으로만 여백을 줘 탭 높이를 44px 로 채운다 —
        // 밑줄 탭이라 ::before 로 벌리면 밑줄과 히트영역이 어긋나 보인다.
        "-mb-px flex min-h-11 cursor-pointer items-end border-b-2 pb-2.5 text-body-sm transition-colors",
        active ? "border-fg font-semibold text-fg" : "border-transparent text-muted hover:text-fg"
      )}
    >
      {children}
    </button>
  );
}

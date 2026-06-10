"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import Link from "next/link";
import type { GalleryPhoto, PhotographerCard } from "@/lib/discovery";
import { PhotographerCardView } from "@/components/user/PhotographerCard";

type Tab = "photos" | "photographers";

// 찜 화면 — '좋아요한 사진' / '관심 작가' 탭 전환
export function FavoritesTabs({
  likedPhotos,
  photographers,
}: {
  likedPhotos: GalleryPhoto[];
  photographers: PhotographerCard[];
}) {
  const [tab, setTab] = useState<Tab>("photos");

  return (
    <>
      {/* 탭 */}
      <div className="mt-5 flex gap-1 border-b border-fg/10">
        <TabButton active={tab === "photos"} onClick={() => setTab("photos")}>
          좋아요한 사진 {likedPhotos.length > 0 && `(${likedPhotos.length})`}
        </TabButton>
        <TabButton active={tab === "photographers"} onClick={() => setTab("photographers")}>
          관심 작가 {photographers.length > 0 && `(${photographers.length})`}
        </TabButton>
      </div>

      {/* 좋아요한 사진 */}
      {tab === "photos" &&
        (likedPhotos.length === 0 ? (
          <Empty>아직 좋아요한 사진이 없어요. 마음에 드는 사진에 ♥를 눌러보세요.</Empty>
        ) : (
          <div className="mt-5 columns-2 gap-3 sm:columns-3 md:columns-4 lg:columns-5 [&>*]:mb-3">
            {likedPhotos.map((p) => (
              <Link
                key={p.id}
                href={`/photos/${p.id}`}
                className="block break-inside-avoid overflow-hidden rounded-2xl bg-fg/[0.05]"
              >
                <img
                  src={p.thumb_url ?? p.src_url}
                  alt=""
                  loading="lazy"
                  className="w-full object-cover"
                />
              </Link>
            ))}
          </div>
        ))}

      {/* 관심 작가 */}
      {tab === "photographers" &&
        (photographers.length === 0 ? (
          <Empty>아직 관심 작가가 없어요. 작가 프로필에서 추가해보세요.</Empty>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photographers.map((p) => (
              <PhotographerCardView key={p.id} p={p} />
            ))}
          </div>
        ))}
    </>
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
      className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-fg text-fg"
          : "border-transparent text-fg/50 hover:text-fg/80"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-12 text-center text-sm text-fg/45">{children}</p>;
}

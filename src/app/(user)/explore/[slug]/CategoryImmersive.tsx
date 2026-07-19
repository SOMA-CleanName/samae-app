"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { GalleryPhoto } from "@/lib/discovery";
import { useCart } from "@/components/user/cart/CartProvider";
import { togglePhotoLike, loadCartPhotoMeta } from "@/app/(user)/actions";
import { HeartIcon } from "@/components/user/icons";

const won = new Intl.NumberFormat("ko-KR");

// 분 → 사람이 읽기 쉬운 촬영시간 (60→"1시간", 90→"1시간 30분", 45→"45분")
function formatDuration(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

// 카테고리 몰입 뷰 — 풀스크린 세로 스와이프(사진이 바로 크게) + 하단 필름스트립으로 빠른 이동.
// 각 사진에 가격·위치·촬영시간·보정본 + 저장·담기·문의.
export function CategoryImmersive({
  photos,
  title,
  initialLiked = [],
}: {
  photos: GalleryPhoto[];
  title: string;
  initialLiked?: string[];
}) {
  const router = useRouter();
  const feedRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [idx, setIdx] = useState(0);
  const [liked, setLiked] = useState<Set<string>>(new Set(initialLiked));
  // 현재 슬라이드의 촬영시간·보정본(가격 최근접 패키지) — 슬라이드마다 지연 조회
  const [pkg, setPkg] = useState<{ photoId: string; durationMin: number | null; editedCount: number | null } | null>(null);
  const cart = useCart();

  const cur = photos[idx];
  const curId = cur?.id;

  // 스크롤 위치 → 현재 슬라이드 index
  function onScroll() {
    const el = feedRef.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== idx) setIdx(Math.max(0, Math.min(photos.length - 1, i)));
  }

  // 현재 슬라이드 촬영시간·보정본 지연 조회 (카트 확대뷰와 동일 로직 재사용)
  useEffect(() => {
    if (!curId) return;
    let alive = true;
    loadCartPhotoMeta(curId).then((m) => {
      if (alive && m) setPkg({ photoId: curId, durationMin: m.durationMin, editedCount: m.editedCount });
    });
    return () => {
      alive = false;
    };
  }, [curId]);

  // 현재 썸네일을 필름스트립 가운데로
  useEffect(() => {
    thumbRefs.current[idx]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [idx]);

  function jump(i: number) {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: i * el.clientHeight, behavior: "smooth" });
  }

  function back() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/explore");
  }

  async function onLike(id: string) {
    setLiked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    try {
      await togglePhotoLike(id);
    } catch {
      /* 낙관적 상태 유지 */
    }
  }

  function toggleCart(p: GalleryPhoto) {
    if (cart.has(p.id)) cart.remove(p.id);
    else cart.add({ id: p.id, src: p.thumb_url ?? p.src_url, w: p.width, h: p.height });
  }

  if (photos.length === 0) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black text-white/70 font-kr">
        <p>이 무드는 아직 준비 중이에요.</p>
      </div>
    );
  }

  const showPkg = pkg && pkg.photoId === curId;

  return (
    <div className="fixed inset-0 z-50 select-none bg-black font-kr text-white">
      {/* 상단 — 뒤로 + 카테고리 제목 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2.5 bg-gradient-to-b from-black/55 to-transparent px-3 pb-6 pt-3">
        <button
          type="button"
          onClick={back}
          aria-label="뒤로"
          className="pointer-events-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold tracking-tight">{title}</p>
          <p className="text-[10px] font-semibold text-white/70 tabular-nums">
            {idx + 1} / {photos.length}
          </p>
        </div>
      </div>

      {/* 몰입 피드 — 세로 스냅. 하단 필름스트립(66px) 만큼 비움 */}
      <div
        ref={feedRef}
        onScroll={onScroll}
        className="absolute inset-x-0 top-0 bottom-[66px] snap-y snap-mandatory overflow-y-auto overscroll-contain scrollbar-none"
      >
        {photos.map((p, i) => {
          const inCart = cart.has(p.id);
          const isLiked = liked.has(p.id);
          const location = p.region ?? null;
          return (
            <div key={p.id} className="relative h-full w-full snap-start overflow-hidden">
              {/* 흐린 배경 채움 — 레터박스를 그 사진 색감으로 */}
              <div
                aria-hidden
                className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl brightness-[.55]"
                style={{ backgroundImage: `url(${p.thumb_url ?? p.src_url})` }}
              />
              {/* 사진 — 안 잘리게 contain. 첫 3장만 우선 로드 */}
              <Image
                src={p.src_url}
                alt=""
                fill
                priority={i < 2}
                sizes="(max-width: 640px) 100vw, 640px"
                draggable={false}
                className="relative object-contain [-webkit-user-drag:none]"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

              {/* 정보 + 액션 */}
              <div className="absolute inset-x-4 bottom-4 z-10">
                {p.price_krw != null && (
                  <p className="text-xl font-extrabold leading-none tracking-tight drop-shadow">
                    ₩{won.format(p.price_krw)}
                  </p>
                )}
                <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-body-sm font-medium text-white/90 drop-shadow">
                  {location && <span>📍 {location}</span>}
                  {i === idx && showPkg && pkg?.durationMin != null && <span>⏱ {formatDuration(pkg.durationMin)}</span>}
                  {i === idx && showPkg && pkg?.editedCount != null && <span>🖼 보정본 {pkg.editedCount}장</span>}
                </p>
                <div className="mt-3.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onLike(p.id)}
                    aria-pressed={isLiked}
                    aria-label={isLiked ? "저장 취소" : "저장"}
                    className={cn(
                      "grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full backdrop-blur transition-colors",
                      isLiked ? "bg-brand text-white" : "bg-white/16 text-white hover:bg-white/25"
                    )}
                  >
                    <HeartIcon className="h-5 w-5" filled={isLiked} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleCart(p)}
                    className={cn(
                      "h-11 shrink-0 cursor-pointer rounded-full px-5 text-sm font-bold backdrop-blur transition-colors",
                      inCart ? "bg-white text-black" : "bg-white/16 text-white hover:bg-white/25"
                    )}
                  >
                    {inCart ? "담김" : "담기"}
                  </button>
                  <Link
                    href={`/inquiry/photo/${p.id}`}
                    className="flex h-11 flex-1 items-center justify-center rounded-full bg-brand text-sm font-bold text-white shadow-lg transition-opacity hover:opacity-90"
                  >
                    문의하기
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 필름스트립 — 빠른 훑기·점프. 현재 컷 강조 */}
      <div
        ref={stripRef}
        className="absolute inset-x-0 bottom-0 z-20 flex h-[66px] gap-1.5 overflow-x-auto bg-gradient-to-t from-black/70 via-black/25 to-transparent px-2.5 pb-2.5 pt-2 scrollbar-none"
      >
        {photos.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              thumbRefs.current[i] = el;
            }}
            type="button"
            onClick={() => jump(i)}
            aria-label={`${i + 1}번째 사진`}
            className={cn(
              "relative h-[46px] w-[32px] shrink-0 overflow-hidden rounded-md transition-all",
              i === idx ? "opacity-100 outline outline-2 outline-white" : "opacity-55"
            )}
          >
            <img src={p.thumb_url ?? p.src_url} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

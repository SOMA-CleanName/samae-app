"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { GalleryPhoto } from "@/lib/discovery";
import { useCart } from "@/components/user/cart/CartProvider";
import { loadCartPhotoMeta } from "@/app/(user)/actions";
import { mpTrack } from "@/lib/mixpanel";

const won = new Intl.NumberFormat("ko-KR");

// 분 → 사람이 읽기 쉬운 촬영시간 (60→"1시간", 90→"1시간 30분", 45→"45분")
function formatDuration(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

// 사진 상세와 동일한 문의 링크 (/inquiry?photographerId&photoId)
function inquiryHref(photographerId: string, photoId: string) {
  const params = new URLSearchParams({ photographerId, photoId });
  return `/inquiry?${params.toString()}`;
}

// 카테고리 몰입 뷰 — 풀스크린 세로 스와이프(사진이 바로 크게) + 하단 필름스트립으로 빠른 이동.
// 각 사진에 가격·위치·촬영시간·보정본 + 담기 · '무료로 견적 받아보기'(문구는 사진 상세와 통일).
export function CategoryImmersive({
  photos,
  title,
}: {
  photos: GalleryPhoto[];
  title: string;
}) {
  const router = useRouter();
  const feedRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [idx, setIdx] = useState(0);
  const [showGuide, setShowGuide] = useState(true);
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
    if (el.scrollTop > 8) setShowGuide(false);
  }

  // 현재 슬라이드 촬영시간·보정본 지연 조회 (상세의 패키지 매핑과 동일 로직 재사용)
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

  // 담기 — 기존 '카트로 빨려들어가는' fly 애니메이션 재사용(출발점 = 현재 슬라이드[data-cart-card]).
  function toggleCart(e: React.MouseEvent<HTMLButtonElement>, p: GalleryPhoto) {
    if (cart.has(p.id)) {
      mpTrack("Remove from Cart", { photo_id: p.id, source: "category-immersive" });
      cart.remove(p.id);
      return;
    }
    mpTrack("Add to Cart", { photo_id: p.id, source: "category-immersive" });
    const card = e.currentTarget.closest<HTMLElement>("[data-cart-card]");
    const srcEl = card ?? document.querySelector<HTMLElement>("[data-cart-card]");
    cart.add({ id: p.id, src: p.thumb_url ?? p.src_url, w: p.width, h: p.height }, srcEl);
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
          const location = p.region ?? null;
          return (
            <div key={p.id} data-cart-card data-pid={p.id} className="relative h-full w-full snap-start overflow-hidden">
              {/* 흐린 배경 채움 — 레터박스를 그 사진 색감으로 */}
              <div
                aria-hidden
                className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl brightness-[.55]"
                style={{ backgroundImage: `url(${p.thumb_url ?? p.src_url})` }}
              />
              {/* 사진 — 안 잘리게 contain. 첫 2장만 우선 로드 */}
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
                    onClick={(e) => toggleCart(e, p)}
                    className={cn(
                      "h-11 shrink-0 cursor-pointer rounded-full px-5 text-sm font-bold backdrop-blur transition-colors",
                      inCart ? "bg-white text-black" : "bg-white/16 text-white hover:bg-white/25"
                    )}
                  >
                    {inCart ? "담김" : "담기"}
                  </button>
                  <Link
                    href={inquiryHref(p.photographer.id, p.id)}
                    className="flex h-11 flex-1 items-center justify-center rounded-full bg-brand text-sm font-bold text-white shadow-lg transition-opacity hover:opacity-90"
                  >
                    무료로 견적 받아보기
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 첫 진입 가이드 — 위로 스와이프 안내. 한 번 스크롤하면 사라짐 */}
      {photos.length > 1 && (
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-[54%] z-10 -translate-x-1/2 transition-opacity duration-500",
            showGuide ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="flex items-center gap-1.5 rounded-full bg-black/45 px-3.5 py-2 backdrop-blur">
            <svg viewBox="0 0 24 24" className="h-4 w-4 animate-bounce" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
            <span className="text-xs font-semibold drop-shadow">위로 밀어 더 보기</span>
          </div>
        </div>
      )}

      {/* 하단 필름스트립 — 빠른 훑기·점프. 현재 컷 강조 */}
      <div
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

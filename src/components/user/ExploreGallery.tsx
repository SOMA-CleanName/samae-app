"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GalleryPhoto } from "@/lib/discovery";
import { togglePhotoLike } from "@/app/(user)/actions";
import { cn } from "@/lib/cn";
import { HeartIcon, SearchIcon } from "@/components/user/icons";
import { EmptyState } from "@/components/ui";

const fmt = new Intl.NumberFormat("ko-KR");
const STEP = 48; // 스크롤마다 더 보여줄 사진 수(메모리에서 즉시 노출)
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useColumnCount() {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(2);
  const [ready, setReady] = useState(false);

  useIsoLayoutEffect(() => {
    if (!node) {
      setReady(false);
      return;
    }
    const compute = () => {
      setCols(Math.max(2, Math.min(7, Math.round(node.clientWidth / 220))));
      setReady(true);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return { cols, ready, setNode };
}

// 높이 균형 그리디 분배 — 각 사진을 가장 짧은 컬럼에 넣는다.
// 순서가 고정이면 prefix-stable: 뒤에 더 추가돼도 앞 사진들의 컬럼/위치가 안 바뀜(재정렬 없음).
function buildColumns(photos: GalleryPhoto[], colCount: number): GalleryPhoto[][] {
  const cols: GalleryPhoto[][] = Array.from({ length: colCount }, () => []);
  const heights = new Array(colCount).fill(0);
  for (const p of photos) {
    const ratio = p.width > 0 && p.height > 0 ? p.height / p.width : 1; // 단위 폭당 상대 높이
    let min = 0;
    for (let c = 1; c < colCount; c++) if (heights[c] < heights[min]) min = c;
    cols[min].push(p);
    heights[min] += ratio;
  }
  return cols;
}

// 탐색 갤러리 — 서버가 셔플된 풀을 내려주고, 클라이언트는 메모리에서 점진 노출(네트워크 없음).
// JS 컬럼 버킷으로 기존 사진은 절대 재배치되지 않음.
export function ExploreGallery({
  photos,
  query,
  likedIds = [],
}: {
  photos: GalleryPhoto[];
  query?: string;
  likedIds?: string[];
}) {
  const [showPrice, setShowPrice] = useState(false);
  const [showName, setShowName] = useState(false);
  const [visible, setVisible] = useState(STEP);
  const sentinel = useRef<HTMLDivElement>(null);
  const { cols: colCount, ready: columnsReady, setNode: setGridRef } = useColumnCount();
  const likedSet = new Set(likedIds);

  // 풀(검색어/네비게이션) 바뀌면 노출 수 초기화
  useEffect(() => setVisible(STEP), [photos, query]);

  // 바닥 근처에서 더 노출 — 메모리에서 즉시(네트워크 없음).
  // IntersectionObserver(주) + 스크롤/리사이즈(폴백). 관찰자 콜백이 한 번씩 누락돼도
  // 폴백이 바닥 근처를 감지해 이어서 노출 → "스크롤해도 안 뜨는" 멈춤 방지.
  useEffect(() => {
    if (visible >= photos.length) return;
    const el = sentinel.current;
    if (!el) return;

    let done = false; // 이 사이클(visible 값)당 1회만 증가 — 폭주/중복 방지
    const bump = () => {
      if (done) return;
      done = true;
      setVisible((v) => Math.min(photos.length, v + STEP));
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) bump();
      },
      { rootMargin: "1200px" }
    );
    io.observe(el);

    // 폴백: 센티넬이 뷰포트 바닥 1200px 이내로 들어오면 직접 노출
    const check = () => {
      const top = el.getBoundingClientRect().top;
      if (top - window.innerHeight < 1200) bump();
    };
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    // 초기 1회 — 첫 화면이 충분히 길지 않아 관찰자 초기 콜백이 애매할 때 대비
    check();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [visible, photos.length]);

  // 보기 옵션(가격·작가명) — 세션 유지 + SearchOptions 토글과 이벤트로 동기화
  useEffect(() => {
    setShowPrice(sessionStorage.getItem("explore:showPrice") === "1");
    setShowName(sessionStorage.getItem("explore:showName") === "1");
    function onPrice(e: Event) {
      setShowPrice((e as CustomEvent).detail as boolean);
    }
    function onName(e: Event) {
      setShowName((e as CustomEvent).detail as boolean);
    }
    window.addEventListener("samae:price-toggle", onPrice);
    window.addEventListener("samae:name-toggle", onName);
    return () => {
      window.removeEventListener("samae:price-toggle", onPrice);
      window.removeEventListener("samae:name-toggle", onName);
    };
  }, []);

  const columns = useMemo(
    () => buildColumns(photos.slice(0, visible), colCount),
    [photos, visible, colCount]
  );

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={<SearchIcon className="h-6 w-6" />}
        title={query ? `“${query}” 결과가 없어요` : "공개된 사진이 아직 없어요"}
        description={
          query
            ? "다른 태그나 장소로 검색해보세요. (예: 서울, 감성, 웨딩)"
            : "작가들이 작품을 올리면 여기에 표시돼요."
        }
        action={
          query ? (
            <Link
              href="/"
              className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg hover:bg-fg/90"
            >
              전체 둘러보기
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {/* 메이슨리 갤러리 — JS 컬럼 버킷(추가 시 기존 사진 위치 고정) */}
      <div
        ref={setGridRef}
        className={cn(
          "flex gap-3 pt-3 transition-opacity",
          columnsReady ? "opacity-100" : "opacity-0"
        )}
      >
        {columns.map((col, ci) => (
          <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3">
            {col.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                showPrice={showPrice}
                showName={showName}
                liked={likedSet.has(photo.id)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* 점진 노출 센티넬 */}
      {visible < photos.length && <div ref={sentinel} className="h-1" />}
    </>
  );
}

// 핀터레스트식 핀 카드 — 비율 예약(레이아웃 점프 방지) + 찜(하트) + 옵션 표시(가격·작가명)
function PhotoCard({
  photo,
  showPrice,
  showName,
  liked,
}: {
  photo: GalleryPhoto;
  showPrice: boolean;
  showName: boolean;
  liked: boolean;
}) {
  const name = photo.photographer.display_name || "작가";
  const tags = (photo.mood_tags ?? []).slice(0, 3).join(", ");
  const alt = tags ? `${name} 작품 · ${tags}` : `${name} 작품`;
  // DB 비율로 공간 예약 → 이미지 로드 시 레이아웃 점프 제거
  const ratio =
    photo.width > 0 && photo.height > 0 ? `${photo.width} / ${photo.height}` : undefined;

  return (
    <div className="group relative break-inside-avoid overflow-hidden rounded-2xl bg-fg/[0.05]">
      <Link href={`/photos/${photo.id}`} className="block" data-track="cta:photo">
        <img
          src={photo.thumb_url ?? photo.src_url}
          alt={alt}
          loading="lazy"
          style={ratio ? { aspectRatio: ratio } : undefined}
          className="w-full object-cover"
        />
      </Link>

      {/* 가격 표시 (토글 ON + 가격 설정된 사진만) */}
      {showPrice && photo.price_krw != null && (
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-fg/85 px-2 py-0.5 text-xs font-semibold text-bg">
          ₩{fmt.format(photo.price_krw)}
        </span>
      )}

      {/* 찜(하트) — hover(또는 키보드 포커스) 시에만 노출, 평소엔 사진에 집중 */}
      <LikeHeart photoId={photo.id} liked={liked} />

      {/* 작가명 (토글 ON일 때만) */}
      {showName && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2.5 pb-2 pt-6 text-xs font-medium text-white">
          <span className="line-clamp-1">{name}</span>
        </span>
      )}
    </div>
  );
}

// 갤러리 좋아요 버튼 — 옵티미스틱(셔플/재요청 없음). 비로그인은 로그인으로.
function LikeHeart({ photoId, liked: initial }: { photoId: string; liked: boolean }) {
  const [liked, setLiked] = useState(initial);
  const [, start] = useTransition();
  const router = useRouter();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const optimistic = !liked;
    setLiked(optimistic);
    start(async () => {
      const res = await togglePhotoLike(photoId);
      if (!res.loggedIn) {
        setLiked(false);
        router.push(`/login?next=${encodeURIComponent(`/photos/${photoId}?like=1`)}`);
        return;
      }
      setLiked(res.liked);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={liked}
      aria-label={liked ? "좋아요 취소" : "좋아요"}
      className={cn(
        "absolute right-2 top-2 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/90 opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-white group-hover:opacity-100 focus-visible:opacity-100",
        liked ? "text-brand" : "text-fg/70"
      )}
    >
      <HeartIcon className="h-5 w-5" filled={liked} />
    </button>
  );
}

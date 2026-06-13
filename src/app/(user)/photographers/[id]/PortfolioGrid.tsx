"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";
import { HeartIcon, LayersIcon, XIcon } from "@/components/user/icons";
import { PhotoCarousel } from "../../photos/[id]/PhotoCarousel";
import { togglePhotoLike, loadPhotoLike } from "../../actions";
import { startConversation } from "../../chat/actions";

const fmt = new Intl.NumberFormat("ko-KR");

type TilePhoto = { id: string; src_url: string; thumb_url: string | null };

export type PortfolioPost = {
  key: string;
  coverId: string;
  cover_src: string;
  cover_thumb: string | null;
  price_krw: number | null;
  location_text: string | null;
  mood_tags: string[];
  count: number;
  photos: TilePhoto[];
};

// 모달에서 예약/좋아요 분기에 필요한 뷰어 정보
export type Viewer = { isOwner: boolean; photographerId: string };

// 작가 포트폴리오 그리드 — 데스크톱은 모달, 모바일은 사진 상세 페이지 이동(§3-3)
export function PortfolioGrid({
  posts,
  viewer,
}: {
  posts: PortfolioPost[];
  viewer: Viewer;
}) {
  const [active, setActive] = useState<PortfolioPost | null>(null);

  if (posts.length === 0) {
    return <p className="mt-3 text-body-sm text-muted">아직 등록된 작품이 없어요.</p>;
  }

  // 데스크톱(md+)에서만 모달, 모바일은 기본 링크 이동(+뒤로가기)
  function onTileClick(e: React.MouseEvent, post: PortfolioPost) {
    if (window.matchMedia("(min-width: 768px)").matches) {
      e.preventDefault();
      setActive(post);
    }
  }

  return (
    <>
      <div className="mt-3 grid grid-cols-3 gap-1 sm:gap-1.5 md:grid-cols-4">
        {posts.map((post) => (
          <Link
            key={post.key}
            href={`/photos/${post.coverId}`}
            onClick={(e) => onTileClick(e, post)}
            className="group relative block aspect-square overflow-hidden rounded bg-fg/[0.05]"
          >
            <img
              src={post.cover_thumb ?? post.cover_src}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
            {post.count > 1 && (
              <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/50 text-white">
                <LayersIcon className="h-3 w-3" />
              </span>
            )}
            {(post.price_krw != null || post.location_text) && (
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/65 to-transparent p-1.5">
                {post.price_krw != null && (
                  <span className="text-[11px] font-semibold text-white">
                    ₩{fmt.format(post.price_krw)}
                  </span>
                )}
                {post.location_text && (
                  <span className="truncate text-[10px] text-white/85">{post.location_text}</span>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>

      {active && (
        <PortfolioModal post={active} viewer={viewer} onClose={() => setActive(null)} />
      )}
    </>
  );
}

// 포트폴리오 모달 — 사진(좌) + 정보·액션(우). 상세 페이지와 동일하게 좋아요·예약까지.
function PortfolioModal({
  post,
  viewer,
  onClose,
}: {
  post: PortfolioPost;
  viewer: Viewer;
  onClose: () => void;
}) {
  // 열려 있는 동안 배경 스크롤 잠금 + Esc 닫기
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 font-kr"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* 가로 2열 — 사진(좌, 넓게) + 정보·액션(우) */}
      <div
        className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-bg shadow-2xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-3 top-3 z-10 grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-black/45 text-white hover:bg-black/60"
        >
          <XIcon className="h-4 w-4" />
        </button>

        {/* 사진 (좌) — 넓은 영역 */}
        <div className="grid min-w-0 flex-1 place-items-center overflow-hidden bg-fg/[0.03]">
          <div className="max-h-[88vh] w-full">
            <PhotoCarousel photos={post.photos} />
          </div>
        </div>

        {/* 정보·액션 (우) — 상세 페이지에서 하던 것 그대로 */}
        <div className="flex shrink-0 flex-col overflow-y-auto p-5 md:w-80 md:border-l md:border-line">
          {post.price_krw != null && (
            <p className="text-title font-semibold tracking-tight">₩{fmt.format(post.price_krw)}</p>
          )}
          {post.location_text && (
            <p className="mt-1 text-body-sm text-muted">{post.location_text}</p>
          )}
          {post.count > 1 && <p className="mt-1 text-caption text-faint">사진 {post.count}장</p>}

          {post.mood_tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.mood_tags.map((m) => (
                <span key={m} className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">
                  #{m}
                </span>
              ))}
            </div>
          )}

          {/* 좋아요 (상세 페이지와 동일 동작) */}
          <div className="mt-4">
            <ModalLikeButton photoId={post.coverId} photographerId={viewer.photographerId} />
          </div>

          {/* 예약·문의 — 상세 페이지 CTA와 동일 분기 */}
          <div className="mt-auto pt-5">
            <ModalCta viewer={viewer} />
          </div>
        </div>
      </div>
    </div>
  );
}

// 모달용 좋아요 버튼 — 열릴 때 서버에서 상태 로드, 클릭 시 낙관적 토글
function ModalLikeButton({
  photoId,
  photographerId,
}: {
  photoId: string;
  photographerId: string;
}) {
  const [state, setState] = useState<{ liked: boolean; count: number; loggedIn: boolean } | null>(
    null
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    loadPhotoLike(photoId).then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [photoId]);

  async function onClick() {
    if (!state || pending) return;
    // 비로그인 → 로그인으로
    if (!state.loggedIn) {
      window.location.href = `/login?next=${encodeURIComponent(`/photographers/${photographerId}`)}`;
      return;
    }
    setPending(true);
    // 낙관적 반영
    const optimisticLiked = !state.liked;
    setState({
      ...state,
      liked: optimisticLiked,
      count: state.count + (optimisticLiked ? 1 : -1),
    });
    try {
      // 재검증 없는 옵티미스틱 토글 (페이지 리프레시 방지)
      const res = await togglePhotoLike(photoId);
      setState((s) => (s ? { ...s, liked: res.liked } : s));
    } catch {
      // 무시 (낙관적 상태 유지)
    }
    setPending(false);
  }

  const liked = state?.liked ?? false;
  const count = state?.count ?? 0;

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={!state}
        aria-pressed={liked}
        aria-label={liked ? "좋아요 취소" : "좋아요"}
        className={cn(
          "grid h-10 w-10 cursor-pointer place-items-center rounded-full border transition-colors disabled:opacity-50",
          liked
            ? "border-brand bg-brand/[0.08] text-brand"
            : "border-line-strong text-fg/55 hover:bg-surface-2"
        )}
      >
        <HeartIcon className="h-5 w-5" filled={liked} />
      </button>
      <span className="text-body-sm text-muted">
        <strong className="text-fg">{count}</strong>
      </span>
    </div>
  );
}

// 모달용 예약·문의 CTA — 본인/로그인/비로그인 분기
function ModalCta({ viewer }: { viewer: Viewer }) {
  if (viewer.isOwner) {
    return (
      <Button href="/studio" variant="secondary" fullWidth>
        내 사진입니다 — 스튜디오로
      </Button>
    );
  }
  return (
    <form action={startConversation}>
      <input type="hidden" name="photographerId" value={viewer.photographerId} />
      <Button type="submit" fullWidth>
        예약·문의하기
      </Button>
    </form>
  );
}

"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "@/components/user/icons";
import type { GuideImage } from "@/lib/guide-images";

// 뷰어를 열자마자 탭한 이미지 위치로 잡아야 해 페인트 전에 스크롤을 옮긴다(PhotoCarousel 과 동일 이유)
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// 인스타식 점 인디케이터 — PhotoCarousel 과 같은 규칙(최대 5개, 양끝은 작게)으로 시각 언어를 맞춘다.
const MAX_DOTS = 5;
function dotWindow(idx: number, total: number): { i: number; scale: number }[] {
  if (total <= MAX_DOTS) return Array.from({ length: total }, (_, i) => ({ i, scale: 1 }));
  let start = idx - Math.floor(MAX_DOTS / 2);
  start = Math.max(0, Math.min(start, total - MAX_DOTS));
  return Array.from({ length: MAX_DOTS }, (_, k) => {
    const i = start + k;
    const moreLeft = start > 0;
    const moreRight = start + MAX_DOTS < total;
    let scale = 1;
    if ((k === 0 && moreLeft) || (k === MAX_DOTS - 1 && moreRight)) scale = 0.5;
    else if ((k === 1 && moreLeft) || (k === MAX_DOTS - 2 && moreRight)) scale = 0.7;
    return { i, scale };
  });
}

// 작가 안내 이미지 — 가로 스크롤 나열. 탭하면 전체화면 스와이프 뷰어.
//
// 세로로 쌓으면 안내 이미지가 페이지를 길게 밀어내 아래(작가 정보·추천)가 접근성을 잃는다.
// 가로 레일이면 몇 장이 있는지 한눈에 보이고, 자세히 볼 사람만 탭해서 뷰어로 간다.
// 이미지에 글자가 들어있어 자르지 않는다 — 높이를 고정하고 폭을 비율대로 흘린다.
export function GuideImageGallery({ images }: { images: GuideImage[] }) {
  const [viewer, setViewer] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <div>
      <ul className="-mx-2.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-2.5 pb-1 scrollbar-none sm:-mx-4 sm:px-4">
        {images.map((img, i) => (
          <li key={img.id} className="w-[68%] shrink-0 snap-start sm:w-[46%]">
            <button
              type="button"
              onClick={() => setViewer(i)}
              className="block w-full cursor-pointer overflow-hidden rounded-2xl bg-fg/[0.05]"
              aria-label={`안내 이미지 ${i + 1} 크게 보기`}
            >
              <img
                src={img.thumb_url ?? img.image_url}
                alt={img.caption || `작가 안내 이미지 ${i + 1}`}
                width={img.width ?? undefined}
                height={img.height ?? undefined}
                loading="lazy"
                className="h-auto w-full object-contain"
              />
            </button>
            {img.caption && (
              <p className="mt-1.5 line-clamp-2 px-1 text-body-sm leading-relaxed text-muted">
                {img.caption}
              </p>
            )}
          </li>
        ))}
      </ul>

      {viewer !== null && (
        <GuideImageViewer images={images} startIndex={viewer} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}

// 전체화면 뷰어 — 좌우 스와이프(스크롤 스냅) + 버튼 + 하단 인디케이터.
// 채팅방(촬영 안내 버튼)에서도 이 뷰어를 그대로 연다 — 손님이 두 곳에서 같은 것을 보게.
export function GuideImageViewer({
  images,
  startIndex,
  onClose,
}: {
  images: GuideImage[];
  startIndex: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(startIndex);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (el && startIndex > 0) el.scrollLeft = startIndex * el.clientWidth;
  }, [startIndex]);

  // 열려있는 동안 배경 스크롤 잠금
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ESC 닫기 · 좌우 키 이동 (현재 위치가 바뀌면 다시 바인딩)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(idx + 1);
      else if (e.key === "ArrowLeft") go(idx - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, onClose]);

  function go(to: number) {
    const el = ref.current;
    if (!el) return;
    const next = Math.max(0, Math.min(images.length - 1, to));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }

  const caption = images[idx]?.caption ?? "";

  return (
    <div
      // 거의 불투명한 검정은 채팅방을 통째로 지워 "어디로 왔지" 가 된다.
      // 뒤가 비치는 정도로만 덮고 흐린다 — 안내를 보다 닫으면 대화로 돌아온다는 게 보인다.
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="작가 안내 이미지"
      // 배경(=사진 바깥) 탭으로 닫기 — 이미지 자체는 스와이프 영역이라 클릭을 삼킨다
      onClick={onClose}
    >
      <div
        ref={ref}
        onScroll={() => {
          const el = ref.current;
          if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-none"
      >
        {images.map((img, i) => (
          <div key={img.id} className="grid h-full w-full shrink-0 snap-center place-items-center p-4">
            <img
              src={img.image_url}
              alt={img.caption || `작가 안내 이미지 ${i + 1}`}
              loading={i === startIndex ? undefined : "lazy"}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-3 top-3 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
      >
        <XIcon className="h-5 w-5" />
      </button>

      {idx > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go(idx - 1);
          }}
          aria-label="이전 이미지"
          className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
        >
          <ChevronLeftIcon />
        </button>
      )}
      {idx < images.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go(idx + 1);
          }}
          aria-label="다음 이미지"
          className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
        >
          <ChevronRightIcon />
        </button>
      )}

      {/* 하단 — 캡션 + 인디케이터. 6장 이상이면 점만으로 위치를 못 읽어 카운터를 같이 준다. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-5">
        {caption && (
          <p className="max-w-lg rounded-xl bg-black/50 px-3 py-2 text-center text-body-sm leading-relaxed text-white/90">
            {caption}
          </p>
        )}
        <div className="flex items-center gap-2">
          <div className="flex max-w-[80%] items-center justify-center gap-1.5 rounded-full bg-white/15 px-2 py-1">
            {dotWindow(idx, images.length).map(({ i, scale }, k) => (
              // 슬롯(위치) 기준 키 — 윈도우가 슬라이드해도 점이 튀지 않는다
              <span
                key={k}
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-200",
                  i === idx ? "bg-white" : "bg-white/45"
                )}
                style={{ transform: `scale(${scale})` }}
              />
            ))}
          </div>
          {images.length > MAX_DOTS && (
            <span className="whitespace-nowrap rounded-full bg-white/15 px-2.5 pb-[5px] pt-[3px] text-xs font-semibold leading-none tabular-nums text-white">
              <span
                className="inline-block text-right"
                style={{ minWidth: `${String(images.length).length}ch` }}
              >
                {idx + 1}
              </span>
              <span className="text-white/55"> / {images.length}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

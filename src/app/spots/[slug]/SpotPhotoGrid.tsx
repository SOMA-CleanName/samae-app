"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * 장소에서 찍힌 사진 — 처음엔 몇 장만, 누르면 전부.
 *
 * 전에는 스물네 장을 한 번에 깔았다. 그러면 이 페이지의 나머지(작가·비용·팁·문답)가
 * 스크롤 세 화면 아래로 밀려 아무도 못 봤다. 사진은 "여기 진짜 사진이 있다"를
 * 증명하는 자리지, 갤러리 자리가 아니다.
 *
 * 접혀 있어도 나머지 사진은 DOM 에 있다 — 크롤러가 보는 건 그대로다.
 */
export function SpotPhotoGrid({
  photos,
  spotName,
  initial = 6,
}: {
  photos: { id: string; url: string }[];
  spotName: string;
  initial?: number;
}) {
  const [open, setOpen] = useState(false);
  const hidden = Math.max(0, photos.length - initial);

  return (
    <div>
      <ul className="grid grid-cols-3 gap-1.5">
        {photos.map((p, i) => (
          <li
            key={p.id}
            // 접힌 상태에서 넘치는 장은 감추되 지우지는 않는다.
            className={!open && i >= initial ? "hidden" : undefined}
          >
            <Link
              href={`/photos/${p.id}`}
              className="sp-cell group block overflow-hidden rounded-sm bg-surface-2"
            >
              {/* 원격 도메인이 next.config 에 없을 수 있어 next/image 대신 <img> */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={`${spotName}에서 촬영한 스냅 사진`}
                loading={i < 6 ? undefined : "lazy"}
                className="sp-img aspect-[3/4] w-full object-cover"
              />
            </Link>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ed-more mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-line bg-surface py-2.5 text-body-sm font-semibold"
        >
          {open ? "사진 접기" : `사진 ${hidden}장 더 보기`}
          <span aria-hidden className="ed-more-arrow text-[11px]">
            {open ? "↑" : "↓"}
          </span>
        </button>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { FeaturedPhoto } from "@/lib/explore-db";

/**
 * 이번 호의 사진.
 *
 * 이 자리엔 '인기 사진' 레일도, 격자도, 잠깐은 '이번 호의 작가'도 있었다.
 * 주인공을 사진으로 되돌린 건 **사매가 개별 작가를 띄우는 서비스가 아니어서**다.
 * 작가를 스타로 만들면 플랫폼이 아니라 그 사람의 채널이 된다.
 * 그래서 이름도 가격도 안 싣고 **어디서 찍혔는지**만 적는다.
 *
 * ── 비율
 * 이 서비스 사진은 절반 가까이가 2:3 세로다. 가로로 납작한 카드(2:1)에
 * object-cover 로 넣었더니 높이의 3분의 2가 날아가 얼굴이 잘렸다.
 * 칸을 눕히는 게 아니라 좁게 만드는 게 답이었다 — 3:4, 잘림이 10% 안쪽이다.
 *
 * ── 캡션을 사진 밖으로
 * 글씨를 사진 위에 얹으면 그걸 읽히게 하려고 사진을 어둡게 눌러야 한다.
 * 잘림을 고쳐 놓고 다시 얼굴을 어둡게 덮는 셈이었다.
 * 도판(圖版)처럼 **사진은 그대로 두고 캡션을 아래에 조판한다** —
 * 잡지가 사진에 번호와 캡션을 다는 방식이고, 이 지면의 다른 카드들(사진 위 오버레이)과도 갈린다.
 *
 * ── 움직임
 * 같은 촬영의 다른 컷으로 **한 번에 한 장씩** 천천히 넘어간다.
 * 넷이 동시에 바뀌면 어수선하고, 안 바뀌면 죽은 격자다. 하나씩이면 곁눈에 걸린다.
 * 리액트 상태를 안 쓰고 DOM 의 opacity 만 만진다 — 리렌더가 없어야 페이드가 안 끊긴다.
 */

const STEP_MS = 3400;

export function PhotoFeature({ photos }: { photos: FeaturedPhoto[] }) {
  const gridRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = gridRef.current;
    if (!el) return;

    let turn = 0;
    const id = setInterval(() => {
      const stacks = el.querySelectorAll<HTMLElement>("[data-shots]");
      if (stacks.length === 0) return;
      // 이번 차례 카드 하나만 넘긴다. 넘길 컷이 없는 카드는 건너뛴다.
      for (let k = 0; k < stacks.length; k += 1) {
        const stack = stacks[(turn + k) % stacks.length];
        const imgs = stack.querySelectorAll<HTMLElement>("img");
        if (imgs.length < 2) continue;
        const next = (Number(stack.dataset.active ?? "0") + 1) % imgs.length;
        stack.dataset.active = String(next);
        imgs.forEach((im, i) => {
          im.style.opacity = i === next ? "1" : "0";
        });
        turn = (turn + k + 1) % stacks.length;
        break;
      }
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  if (photos.length === 0) return null;

  return (
    <ul ref={gridRef} className="grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-4 sm:gap-x-3">
      {photos.map((p, i) => {
        const shots = [p.coverUrl, ...p.moreUrls].slice(0, 4);
        return (
          <li key={p.id}>
            <Link href={`/photos/${p.id}`} className="pf group block">
              {/* 도판 — 사진 위에 아무것도 얹지 않는다 */}
              <figure className="m-0">
                <span
                  data-shots
                  data-active="0"
                  className="relative block aspect-[3/4] w-full overflow-hidden rounded-lg bg-surface-2"
                >
                  {shots.map((url, k) => (
                    // 원격 도메인이 next.config 에 없을 수 있어 next/image 대신 <img>
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt={k === 0 ? (p.location ? `${p.location}에서 촬영한 스냅 사진` : "스냅 사진") : ""}
                      loading={i === 0 && k === 0 ? undefined : "lazy"}
                      // 첫 장만 보이게 시작한다. 이후 opacity 는 위 인터벌이 직접 쓴다.
                      // 절대 CSS 기본값으로 숨기지 않는다 — JS 가 안 돌면 첫 장은 그대로 보여야 한다.
                      style={{ opacity: k === 0 ? 1 : 0 }}
                      className="pf-img absolute inset-0 h-full w-full object-cover transition-opacity duration-[900ms] ease-in-out"
                    />
                  ))}
                </span>

                {/* 캡션 — 도판 번호 + 괘선, 그 아래 촬영지 */}
                <figcaption className="mt-2">
                  <span className="flex items-center gap-1.5">
                    <span className="font-display text-[11px] italic tabular-nums leading-none text-brand">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {/* 괘선 — 손을 대면 브랜드색이 왼쪽에서 차오른다 */}
                    <span aria-hidden className="pf-rule relative h-px flex-1 bg-line" />
                    {shots.length > 1 && (
                      <span
                        aria-hidden
                        className="text-[9px] tabular-nums leading-none text-faint"
                        title={`같은 촬영 ${shots.length}컷`}
                      >
                        {shots.length}컷
                      </span>
                    )}
                  </span>

                  {p.location && (
                    <span className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="pf-loc min-w-0 truncate text-[13px] font-bold tracking-tight">
                        {p.location}
                      </span>
                      <span aria-hidden className="pf-arrow shrink-0 text-[11px] text-faint">
                        →
                      </span>
                    </span>
                  )}
                </figcaption>
              </figure>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

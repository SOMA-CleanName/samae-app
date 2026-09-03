"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RailArrows } from "@/components/user/RailArrows";
import type { SpotCard } from "@/lib/spots";

/**
 * 촬영 장소 레일.
 *
 * 카드는 참고한 게 Ibiza 티켓이다 — 사진 아래 점선 절취선, 그 밑에 필드로 박힌 정보.
 * 장소 페이지가 블로그와 갈리는 지점이 "여기서 찍힌 사진이 몇 장 있냐"라서,
 * 그 숫자를 감성 문구가 아니라 **입장권의 필드처럼** 박아 둔다.
 *
 * ── 끝에서 당기면 전체보기로
 * 레일 끝에 '더 보기' 카드를 하나 더 붙이는 대신, **끝을 넘겨 당기는 동작 자체**를
 * 지면 넘김으로 쓴다. iOS 에서 목록 끝을 당기는 그 동작이다.
 *   · 끝에 닿은 뒤 더 밀면 오른쪽에서 '전체 보기'가 당겨진 만큼 열린다
 *   · 문턱(PULL_TRIGGER)을 넘긴 채 손을 떼면 /spots 로 넘어간다
 *   · 못 넘기고 떼면 그냥 제자리로 — 실수로 넘어가지 않는다
 *
 * 왜 스크롤 이벤트로만 하나: 터치 좌표를 직접 따라가면 관성 스크롤과 싸운다
 * (인기 사진 레일에서 그렇게 해서 실패했다). 여기서는 브라우저가 만들어 준
 * 오버스크롤 값(scrollLeft 가 최대치를 넘어간 양)만 읽는다 — 우리가 스크롤을
 * 만지지 않으니 싸울 상대가 없다.
 */

/** 이만큼 당기면 넘어간다(px). */
const PULL_TRIGGER = 72;
/** 당김 영역의 최대 폭 — 이보다 더 당겨도 더 안 열린다. */
const PULL_MAX = 96;

export function SpotsRail({
  spots,
  total,
}: {
  spots: SpotCard[];
  total?: number;
}) {
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const armed = useRef(false); // 문턱을 넘긴 상태로 손을 떼야 넘어간다
  const navigating = useRef(false);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    let raf = 0;
    const read = () => {
      raf = 0;
      // 오버스크롤 양 — 안드로이드·데스크탑은 0 에서 멈추므로 아래 여분 칸이 대신 열린다.
      const over = el.scrollLeft - (el.scrollWidth - el.clientWidth);
      const next = Math.max(0, Math.min(PULL_MAX, over));
      setPull(next);
      if (next >= PULL_TRIGGER) armed.current = true;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };

    const release = () => {
      if (armed.current && !navigating.current) {
        navigating.current = true;
        router.push("/spots");
      }
      armed.current = false;
      setPull(0);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchend", release);
    el.addEventListener("touchcancel", release);
    el.addEventListener("pointerup", release);
    el.addEventListener("mouseleave", release);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchend", release);
      el.removeEventListener("touchcancel", release);
      el.removeEventListener("pointerup", release);
      el.removeEventListener("mouseleave", release);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [router]);

  const ready = pull >= PULL_TRIGGER;
  const rest = Math.max(0, (total ?? spots.length) - spots.length);

  return (
    <div className="relative">
      <div
        ref={trackRef}
        // overscroll-x-auto: 끝에서 더 밀면 브라우저가 고무줄을 준다(iOS). contain 이면 안 준다.
        className="-mx-4 flex overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex gap-3">
          {spots.map((s) => (
            <li key={s.slug} className="w-[228px] shrink-0">
              <Link
                href={`/spots/${s.slug}`}
                className="ed-cell group block overflow-hidden rounded-lg border border-line bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.coverUrl as string}
                  alt={`${s.name}에서 촬영한 스냅`}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />

                {/* 절취선 — 양옆이 안으로 파인 티켓 모양 */}
                <div className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-bg"
                  />
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full bg-bg"
                  />
                  <span
                    aria-hidden
                    className="block border-t border-dashed border-line-strong"
                  />
                </div>

                <div className="p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
                    {s.area}
                  </p>
                  <p className="mt-1 text-body font-bold tracking-tight transition-colors group-hover:text-brand">
                    {s.name}
                  </p>

                  <dl className="mt-3 flex items-baseline justify-between border-t border-line pt-2.5 text-[11px]">
                    <dt className="uppercase tracking-[0.12em] text-faint">
                      여기서 찍힌 사진
                    </dt>
                    <dd className="font-bold tabular-nums">{s.count}</dd>
                  </dl>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {/*
        당김 영역 — 평소엔 폭 0 이라 없는 것과 같다.
        오버스크롤이 안 되는 환경(안드로이드 크롬·데스크탑)에서도 이 칸이 열리면서
        같은 동작이 되도록, 폭을 스크롤 양이 아니라 pull 값으로 직접 준다.
      */}
        <div
          aria-hidden
          className="sp-pull flex shrink-0 items-center justify-center overflow-hidden"
          style={{ width: pull }}
        >
          <span
            className={`whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
              ready ? "text-brand" : "text-faint"
            }`}
            style={{ opacity: Math.min(1, pull / PULL_TRIGGER) }}
          >
            {ready ? "놓으면 이동 →" : "전체 보기"}
          </span>
        </div>

        {/*
        당겨서 넘기는 건 손가락이 있는 화면에서만 되는 동작이다.
        마우스·키보드로 오는 사람에게는 평범한 링크가 하나 있어야 한다.
      */}
        <Link
          href="/spots"
          className="ed-more ml-3 flex w-[132px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-body-sm font-semibold"
        >
          전체 보기
          {rest > 0 && (
            <span className="text-[11px] font-normal tabular-nums text-faint">
              +{rest}곳
            </span>
          )}
        </Link>
      </div>

      {/*
        데스크톱에는 미는 방법이 없다 — 마우스 휠은 세로만 굴리고 스크롤바는 숨겼다.
        위의 '당겨서 전체보기'도 손가락 동작이라 마우스로는 시작조차 안 된다.
      */}
      <RailArrows targetRef={trackRef} label="장소" />
    </div>
  );
}

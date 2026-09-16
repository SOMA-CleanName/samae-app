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
 * 레일 끝에 '더 보기' 카드를 붙이는 대신, **끝을 넘겨 당기는 동작 자체**를 지면
 * 넘김으로 쓴다. 세로 목록을 당겨 새로고침하는 그 동작의 가로판이다.
 *   · 끝에 닿은 뒤 더 당기면 오른쪽에서 표식이 당긴 만큼 열린다(저항이 걸린다)
 *   · 문턱(PULL_TRIGGER)을 넘긴 채 손을 떼면 쫙 닫히면서 /spots 로 넘어간다
 *   · 못 넘기고 떼면 그냥 제자리로 — 실수로 넘어가지 않는다
 *
 * ⚠️ 예전엔 브라우저가 만들어 준 **오버스크롤 값**(scrollLeft 가 최대치를 넘어간 양)만
 *    읽었다. 그건 iOS 고무줄이 있을 때만 생기는 값이라, **안드로이드 크롬·데스크톱에서는
 *    영영 0** 이었다 — 거기서는 당김이 아예 존재하지 않았고, 그래서 레일 끝에 점선
 *    '전체 보기' 카드를 대신 세워 뒀다. 그 카드가 정작 당김을 가로막고 있었다
 *    (정훈 2026-09-12: "슬라이드 쭉 하면 나오는 전체보기는 저게 아니라").
 *
 *    이제 터치 좌표로 직접 당긴다. 관성과 싸우지 않는 이유는 **끝에 닿은 뒤에만**
 *    개입하기 때문이다 — 그 지점에서 스크롤러는 이미 더 갈 데가 없다.
 *    네이티브 고무줄은 `overscroll-behavior-x: contain` 으로 꺼서 두 겹으로 밀리지 않게 한다.
 */

/** 이만큼 당기면 넘어간다(px). */
const PULL_TRIGGER = 72;
/** 당김 영역의 최대 폭 — 이보다 더 당겨도 더 안 열린다. */
const PULL_MAX = 110;

/**
 * 당김 저항 — 손가락이 간 거리보다 **덜** 열린다.
 *
 * 1:1 로 따라가면 끝이 없는 것처럼 느껴져 어디까지 당겨야 하는지 모른다.
 * 지수 감쇠를 걸면 처음엔 잘 따라오다 PULL_MAX 에 가까워질수록 뻑뻑해져서,
 * "여기가 끝이구나"가 손에 전해진다.
 */
function damp(raw: number): number {
  return PULL_MAX * (1 - Math.exp(-raw / (PULL_MAX * 0.9)));
}

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
  /** 손을 떼는 중인가 — 그때만 닫히는 애니메이션을 건다(당기는 중엔 손을 따라야 한다) */
  const [releasing, setReleasing] = useState(false);
  const armed = useRef(false); // 문턱을 넘긴 상태로 손을 떼야 넘어간다
  const navigating = useRef(false);
  /** 끝에 닿은 순간의 손가락 x — 여기서부터 당긴 거리를 센다 */
  const anchor = useRef<number | null>(null);
  /** 지금 당겨져 있나(상태 대신 ref — 리스너를 다시 붙이지 않기 위해) */
  const pulled = useRef(false);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const atEnd = () => el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;

    const onTouchStart = () => {
      anchor.current = null;
      setReleasing(false);
    };

    const onTouchMove = (e: TouchEvent) => {
      const x = e.touches[0]?.clientX;
      if (x == null) return;

      if (!atEnd()) {
        // 아직 밀 데가 남았다 — 스크롤러에게 맡긴다
        if (anchor.current !== null) {
          anchor.current = null;
          armed.current = false;
          pulled.current = false;
          setPull(0);
        }
        return;
      }

      if (anchor.current === null) {
        anchor.current = x; // 끝에 막 닿았다. 여기서부터가 '당김'이다
        return;
      }

      const raw = anchor.current - x; // 왼쪽으로 끌면 양수
      if (raw <= 0) {
        armed.current = false;
        pulled.current = false;
        setPull(0);
        return;
      }
      // 끝에 닿은 뒤의 드래그는 스크롤러가 쓸 수 없다 — 우리가 가져와 당김으로 쓴다.
      // (막지 않으면 iOS 고무줄이 겹쳐 두 겹으로 밀린다)
      e.preventDefault();
      const next = damp(raw);
      armed.current = next >= PULL_TRIGGER;
      pulled.current = next > 0;
      setPull(next);
    };

    const release = () => {
      anchor.current = null;
      // `pull` 을 의존성으로 넣으면 당길 때마다 리스너가 새로 붙었다 떨어진다 —
      // 제스처 도중에 그러면 touchend 를 놓친다. 그래서 상태가 아니라 ref 로 본다.
      if (!pulled.current && !armed.current) return;
      pulled.current = false;
      setReleasing(true); // 쫙 닫히는 전환
      setPull(0);
      if (armed.current && !navigating.current) {
        navigating.current = true;
        // 닫히는 모습을 한 박자 보여 주고 넘어간다 — 즉시 넘기면 당긴 보람이 없다
        window.setTimeout(() => router.push("/spots"), 180);
      }
      armed.current = false;
    };

    /*
      트랙패드 가로 스와이프 — 데스크톱에서도 같은 동작이 되게 한다.

      맥 트랙패드의 두 손가락 가로 스와이프는 **터치가 아니라 `wheel`** 이라 위의
      터치 경로에 안 걸린다(정훈 2026-09-12: "데스크탑에서는 동작 확인 못하나?").
      마우스 휠만 있는 환경에서는 `deltaX` 가 안 생기므로 그냥 아무 일도 안 일어난다 —
      그쪽은 섹션 머리의 '전체 보기'와 화살표(RailArrows)가 맡는다.

      휠에는 '손을 뗀다'는 사건이 없다. 그래서 **잠깐 멈추면 뗀 것으로 친다**(settle).
      관성으로 이벤트가 이어지는 동안에는 계속 당겨진 상태가 유지된다.
    */
    let wheelRaw = 0;
    let wheelSettle = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // 세로 스크롤은 지면 몫
      if (!atEnd() || e.deltaX <= 0) {
        if (wheelRaw !== 0) {
          wheelRaw = 0;
          armed.current = false;
          pulled.current = false;
          setPull(0);
        }
        return;
      }
      e.preventDefault(); // 끝에서 더 미는 만큼은 우리가 쓴다
      wheelRaw += e.deltaX;
      const next = damp(wheelRaw);
      armed.current = next >= PULL_TRIGGER;
      pulled.current = next > 0;
      setPull(next);

      window.clearTimeout(wheelSettle);
      wheelSettle = window.setTimeout(() => {
        wheelRaw = 0;
        release();
      }, 140);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    // passive:false — 끝에 닿았을 때 preventDefault 로 네이티브 고무줄을 끈다
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", release);
    el.addEventListener("touchcancel", release);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", release);
      el.removeEventListener("touchcancel", release);
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(wheelSettle);
    };
  }, [router]);

  const ready = pull >= PULL_TRIGGER;
  const rest = Math.max(0, (total ?? spots.length) - spots.length);

  return (
    <div className="relative">
      {/*
        당김 표식 — **스크롤러 바깥**에 둔다.

        ⚠️ 처음엔 스크롤러 **안**에 넣고 폭을 늘렸다. 그러면 폭이 열리는 만큼
           `scrollWidth` 도 같이 늘어나 "끝에 닿음"이 풀리고, 다음 프레임에 당김이
           0 으로 되돌아간다 — 자기 자신과 싸운다(실측: 160px 을 당겨도 15px 만 열렸다).

           밖에 두고 레일을 `transform` 으로 밀면 스크롤 수치가 안 변한다.

        오른쪽 화면 끝에 붙인다(`-right-4` = 레일의 `-mx-4` 만큼). 레일이 왼쪽으로
        밀리면서 이 자리가 드러난다.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -right-4 flex items-center justify-center"
        style={{ width: PULL_MAX }}
      >
        <span
          className="flex flex-col items-center gap-1.5"
          style={{ opacity: Math.min(1, pull / (PULL_TRIGGER * 0.55)) }}
        >
          {/* 화살표가 문턱을 넘으면 반 바퀴 돈다 — 당겨 새로고침의 그 신호 */}
          <span
            className={`grid h-9 w-9 place-items-center rounded-full border transition-colors duration-200 ${
              ready ? "border-brand bg-brand text-white" : "border-line-strong text-faint"
            }`}
          >
            <span
              className="text-[13px] leading-none transition-transform duration-300"
              style={{ transform: ready ? "rotate(180deg)" : "none" }}
            >
              →
            </span>
          </span>
          <span
            className={`whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
              ready ? "text-brand" : "text-faint"
            }`}
          >
            {ready ? "놓으면 이동" : "전체 보기"}
            {rest > 0 && !ready && (
              <span className="ml-1 font-normal tabular-nums normal-case">+{rest}</span>
            )}
          </span>
        </span>
      </div>

      <div
        ref={trackRef}
        /*
          `overscroll-x-contain` — 네이티브 고무줄을 끈다.
          켜 두면 끝에서 당길 때 우리 표식과 iOS 고무줄이 **동시에** 밀려 두 겹으로 움직인다.
          당김은 이제 우리가 직접 그린다(위 useEffect).

          `relative` — 안 당겼을 때 위 표식을 카드가 덮게 한다(쌓임 순서).
        */
        className="relative -mx-4 flex overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          // 레일을 통째로 왼쪽으로 민다. transform 은 레이아웃·스크롤 수치를 안 건드린다.
          transform: `translateX(${-pull}px)`,
          transition: releasing
            ? "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)"
            : undefined,
        }}
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
                    <dt className="uppercase tracking-[0.12em] text-faint">사진</dt>
                    <dd className="font-bold tabular-nums">{s.count}</dd>
                  </dl>
                </div>
              </Link>
            </li>
          ))}
        </ul>

      </div>

      {/*
        데스크톱에는 미는 방법이 없다 — 마우스 휠은 세로만 굴리고 스크롤바는 숨겼다.
        위의 '당겨서 전체보기'도 손가락 동작이라 마우스로는 시작조차 안 된다.
      */}
      <RailArrows targetRef={trackRef} label="장소" />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RailArrows } from "@/components/user/RailArrows";
import type { ArticleCard } from "@/lib/articles";
// 카드 한 칸에 810KB 원본이 내려오고 있었다 — 같은 사진의 썸네일은 29~84KB 다
import { thumbUrl } from "@/lib/image-thumb";

/**
 * 아티클 덱 — 카드를 한 장씩 넘겨 본다.
 *
 * 격자로 여러 장을 한 번에 깔았더니 카드마다 자리가 좁아 제목·요약이 다 눌렸다.
 * 한 장씩 크게 보여주면 글이 들어갈 자리가 생기고, 넘기는 동작 자체가 재미가 된다.
 *
 * 드래그 물리를 직접 짜지 않고 **네이티브 가로 스크롤 + 스냅** 위에 변형만 얹었다.
 *   · 손가락 관성·튕김이 기기 기본값 그대로라 어색하지 않다
 *   · 키보드·스크린리더로도 그냥 링크 목록이다
 *   · 스크롤 위치로 계산하므로 상태가 어긋날 일이 없다
 *
 * 폰: 가운데 한 장이 서고, 멀어질수록 작아지고 기울고 어두워진다 — 카드가 쌓인 것처럼.
 * 데스크톱(sm~): 왼쪽부터 여러 장. 카드 하나를 가운데 세우려면 좌우를 (레일폭−카드폭)/2
 *   만큼 비워야 하는데, 1361px 화면에서 그게 한쪽당 528px 라 화면 절반이 빈다.
 *   기울임도 끈다 — 늘 보이는 첫 카드가 기운 채로 제목 옆에 놓이면 고장으로 읽힌다.
 *   대신 밀 수단이 없으므로 화살표를 세운다(RailArrows).
 */
/**
 * 무한으로 돌리려면 이만큼은 있어야 한다.
 *
 * 두 장이면 사본을 이어 붙여도 같은 카드가 바로 옆에 서서 "복제"가 그대로 들킨다.
 * 세 장부터는 좌·중·우가 모두 다른 글이라 이어진 것처럼 보인다.
 */
const LOOP_MIN = 3;

export function ArticleDeck({ articles }: { articles: ArticleCard[] }) {
  const railRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  /*
    무한 루프 — 목록을 **세 벌** 이어 붙이고 가운데 벌에서 시작한다.

    한 벌만 두면 첫 카드 왼쪽이 비어서, 맨 앞에 있을 때 "왼쪽에 마지막 글이 걸쳐
    보이는" 그림이 안 나온다(정훈 2026-09-12). 세 벌이면 어느 자리에 있든 양옆에
    카드가 있고, 끝에 다다르면 같은 그림인 가운데 벌로 **소리 없이 되돌린다**.

    두 벌이 아니라 세 벌인 이유: 되돌릴 때 기준이 되는 '가운데'가 있어야 좌우 어느
    쪽으로 벗어나든 같은 방식으로 접을 수 있다.
  */
  const len = articles.length;
  const loop = len >= LOOP_MIN;
  const items = loop ? [...articles, ...articles, ...articles] : articles;
  /** 되돌리는 중 — 그 프레임의 스크롤 이벤트는 무시한다(재진입 방지) */
  const wrapping = useRef(false);
  const inited = useRef(false);

  /** i 번째 카드를 제자리에 세우는 scrollLeft. 폰은 가운데, 데스크톱은 왼쪽 정렬. */
  const offsetFor = useCallback((i: number) => {
    const el = railRef.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return null;
    // 데스크톱은 왼쪽 정렬(24 = .deck 의 sm~ padding-inline).
    // 가운데로 보내면 카드가 여러 장 보이는 화면에서 왼쪽 절반이 또 빈다.
    return el.clientWidth >= 640
      ? card.offsetLeft - 24
      : card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2;
  }, []);

  const apply = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    /*
      넓은 화면에서는 카드가 한 번에 여러 장 보인다(.deck 의 sm~ 규칙).
      그때도 '가운데 한 장'을 세우면 화면에 늘 보이는 첫 카드가 작고 기운 채로
      제목 옆에 놓여 망가져 보인다. 기준도 함께 바꾼다 —
        폰   : 가운데에 가장 가까운 카드
        데스크톱: 왼쪽 끝에 가장 가까운 카드
    */
    const wide = el.clientWidth >= 640;
    const anchor = wide ? el.scrollLeft : el.scrollLeft + el.clientWidth / 2;
    let nearest = 0;
    let nearestDist = Infinity;

    Array.from(el.children).forEach((child, i) => {
      const s = child as HTMLElement;
      const dist =
        (wide ? s.offsetLeft : s.offsetLeft + s.offsetWidth / 2) - anchor;
      if (wide) {
        // 인라인 스타일을 비워 CSS 기본값으로 되돌린다. 창을 좁혔다 넓히면
        // 폰에서 넣어 둔 transform 이 그대로 남아 카드가 기운 채 굳는다.
        s.style.transform = "";
        s.style.opacity = "";
        s.style.zIndex = "";
      } else {
        const t = Math.min(1, Math.abs(dist) / s.offsetWidth); // 0 = 정중앙
        const dir = dist < 0 ? -1 : 1;
        s.style.transform = `scale(${(1 - 0.12 * t).toFixed(3)}) rotate(${(dir * 2.4 * t).toFixed(2)}deg)`;
        s.style.opacity = (1 - 0.35 * t).toFixed(2);
        s.style.zIndex = String(100 - Math.round(t * 100));
      }
      if (Math.abs(dist) < nearestDist) {
        nearestDist = Math.abs(dist);
        nearest = i;
      }
    });
    // 사본이 셋이므로 몇 번째 '글'인지로 접어서 점과 맞춘다
    const idx = loop ? nearest % len : nearest;
    setActive((prev) => (prev === idx ? prev : idx));
  }, [loop, len]);

  /*
    끝에 다다르면 같은 그림인 가운데 벌로 되돌린다.

    ⚠️ **스크롤이 멈춘 뒤에만** 부른다(아래 onSettle).
       움직이는 중에 `scrollLeft` 를 건드리면 `scroll-snap-type: x mandatory` 가
       곧바로 다시 스냅을 걸어 서로 밀치고, 손에는 "드드드드득" 걸리는 느낌이 온다
       (정훈 2026-09-12: "3→4 4→3 일때 막 엄청 드드드드득 댄다").
       벌이 셋이라 한 번의 제스처로는 진짜 끝까지 못 가므로 늦게 접어도 안전하다.

    `scrollTo({behavior:'smooth'})` 가 아니라 `scrollLeft` 에 직접 넣는다 — 부드럽게
    움직이면 되돌리는 과정이 보인다. 직접 넣으면 같은 그림이라 눈에 안 띈다.
  */
  const wrap = useCallback(() => {
    const el = railRef.current;
    if (!el || !loop) return;
    const copy = el.scrollWidth / 3;
    if (copy <= 0) return;
    if (el.scrollLeft < copy * 0.5) {
      wrapping.current = true;
      el.scrollLeft += copy;
    } else if (el.scrollLeft > copy * 1.5) {
      wrapping.current = true;
      el.scrollLeft -= copy;
    }
  }, [loop]);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    let raf = 0;
    let settleTimer = 0;

    /*
      스크롤이 멎었는가.

      `scrollend` 는 아직 모든 브라우저에 있지 않아서(구형 사파리) 타이머로도 받쳐 둔다.
      둘 다 와도 `wrap()` 은 조건을 다시 보므로 두 번 접히지 않는다.
    */
    const onSettle = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        wrap();
        apply();
      }, 140);
    };

    const onScroll = () => {
      // 움직이는 동안에는 **변형만** 다시 그린다. 위치는 건드리지 않는다.
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          wrapping.current = false;
          apply();
        });
      onSettle();
    };

    /*
      시작 위치 — 가운데 벌의 첫 글.
      레이아웃(카드 폭·패딩)이 잡힌 뒤라야 offsetLeft 가 맞으므로 한 프레임 기다린다.
      `scroll-snap-type: x mandatory` 가 초기값을 밀어낼 수 있어 한 번 더 확인한다.
    */
    let f1 = 0;
    let t = 0;
    if (loop && !inited.current) {
      const place = () => {
        const left = offsetFor(len);
        if (left == null) return;
        el.scrollLeft = left;
        inited.current = true;
        apply();
      };
      f1 = requestAnimationFrame(place);
      t = window.setTimeout(place, 300);
    }

    // 스냅까지 끝난 시점을 브라우저가 알려주면 그게 가장 정확하다.
    const onScrollEnd = () => {
      window.clearTimeout(settleTimer);
      wrap();
      apply();
    };

    apply();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onScrollEnd);
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScrollEnd);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      cancelAnimationFrame(f1);
      window.clearTimeout(t);
      window.clearTimeout(settleTimer);
    };
  }, [apply, wrap, loop, len, offsetFor]);

  /** 점을 눌렀을 때 — 지금 있는 벌 안에서 **가장 가까운** 같은 글로 간다. */
  const goTo = (i: number) => {
    const el = railRef.current;
    if (!el) return;
    let target = i;
    if (loop) {
      // 현재 위치가 몇 번째 벌인지 보고, 그 벌의 같은 글을 고른다 —
      // 늘 가운데 벌로 보내면 3번째 글에서 1번째 점을 눌렀을 때 덱이 통째로 되감긴다.
      const copy = el.scrollWidth / 3;
      const band = copy > 0 ? Math.floor(el.scrollLeft / copy) : 1;
      target = Math.min(2, Math.max(0, band)) * len + i;
    }
    const left = offsetFor(target);
    if (left == null) return;
    el.scrollTo({
      left,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  return (
    <div>
      {/* relative — 화살표가 레일 위에 얹힌다. 아래 점 줄은 감싸지 않는다
          (같이 감싸면 top-1/2 가 점까지 포함한 가운데라 화살표가 아래로 처진다)
          isolate — 아래에서 카드에 인라인으로 쓰는 zIndex(최대 100)를 이 안에 가둔다.
          안 가두면 sticky 러닝헤드·하단 내비(z-40)를 카드가 덮는다. */}
      <div className="relative isolate">
        {/* 폭·좌우 여백은 .deck 이 --deck-w 로 함께 잡는다(globals.css) */}
        <ul ref={railRef} className="deck -mx-4 flex gap-3 sm:-mx-6">
          {items.map((a, i) => (
            // 사본이 셋이라 id 가 겹친다 — 자리 번호를 붙여 키를 가른다
            <li key={`${a.id}:${i}`} className="deck-card shrink-0">
              <Link
                href={`/articles/${encodeURIComponent(a.slug)}`}
                // 가운데 벌이 아닌 사본은 보조 탭 순서에서 뺀다 — 안 그러면 Tab 을
                // 눌렀을 때 같은 글이 세 번 걸린다. 화면에는 똑같이 보인다.
                tabIndex={loop && Math.floor(i / len) !== 1 ? -1 : undefined}
                aria-hidden={loop && Math.floor(i / len) !== 1 ? true : undefined}
                className="group block overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line"
              >
                {/*
                  카드 비율 — 폰은 정사각, sm~ 은 4:5.

                  전에는 폰도 4:5 라 286px 폭에서 **357px** 이었다. 점 줄(44)까지
                  더하면 ARTICLES 한 블록이 545px — 844 화면의 3분의 2 를 글 한 섹션이
                  먹었다(실측 2026-09-12). 정사각이면 286 으로 71px 이 줄고,
                  제목·요약이 앉을 자리는 그대로다(글은 아래 5분의 3 안에 있다).

                  데스크톱은 카드가 여러 장 나란히 서고 세로도 넉넉해서 4:5 를 지킨다.
                */}
                <span className="relative block aspect-square w-full overflow-hidden bg-surface-2 sm:aspect-[4/5]">
                  {a.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl(a.cover_url)}
                      alt={a.cover_alt || a.title}
                      // 가운데 벌의 첫 장만 즉시 — 나머지는 지연
                      loading={i === len ? undefined : "lazy"}
                      className="deck-img h-full w-full object-cover"
                    />
                  )}
                  {/*
                  글이 앉는 아래쪽만 확실히 깐다.
                  기존 ed-tile-veil 은 옅어서 밝은 사진 위에서 흰 글씨가 묻혔다.
                  위쪽은 투명하게 둬 사진을 가리지 않는다.
                */}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/88 via-black/62 to-transparent"
                  />

                  {/* 번호 — 몇 번째 글인지. 카드가 한 장씩 보이니 위치 감각이 필요하다.
                      사본이 셋이라 자리 번호가 아니라 **글 번호**로 접어서 센다. */}
                  <span className="absolute left-4 top-4 font-display text-[11px] italic tabular-nums text-white/85">
                    {String((i % len) + 1).padStart(2, "0")} /{" "}
                    {String(len).padStart(2, "0")}
                  </span>

                  <span className="absolute inset-x-0 bottom-0 block p-4">
                    <span className="line-clamp-3 block text-[clamp(1.15rem,4.6vw,1.5rem)] font-extrabold leading-[1.22] tracking-[-0.03em] text-white">
                      {a.title}
                    </span>
                    {a.summary && (
                      <span className="mt-2 line-clamp-3 block text-[12px] leading-relaxed text-white/85">
                        {a.summary}
                      </span>
                    )}
                    <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                      읽어보기
                      <span aria-hidden className="deck-arrow">
                        →
                      </span>
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* 데스크톱에는 미는 방법이 없다 — 휠은 세로만 굴리고 스크롤바도 숨겼다 */}
        <RailArrows targetRef={railRef} label="글" />
      </div>

      {/*
        점 — 어디쯤인지. 눌러서 이동도 된다.

        버튼은 32×44 로 **터치 규격을 지킨다**. 다만 점은 6px 이라 그 44px 중 38px 가
        순수 빈칸이고, 그게 카드와 다음 섹션 사이를 통째로 벌려 놓았다
        (실측: 카드 아랫변 → 다음 섹션 머리 91px · 정훈 2026-09-12 "여백이 너무 커").

        그래서 **줄의 레이아웃 높이만** 위아래로 8px 씩 당긴다(`-my-2`). 누를 수 있는
        넓이는 그대로고, 위아래로 남는 빈칸에 겹칠 뿐이다 — 거기엔 아무것도 없다.
      */}
      {articles.length > 1 && (
        <div className="-my-2 flex justify-center">
          {articles.map((a, i) => (
            <button
              key={a.id}
              type="button"
              aria-label={`${i + 1}번째 글 보기`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => goTo(i)}
              // 점 규격은 BannerCarousel 과 동일 — 점은 6px, 버튼은 32×44.
              className="group grid h-11 w-8 cursor-pointer place-items-center"
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === active ? "bg-fg" : "bg-line-strong group-hover:bg-fg/40"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

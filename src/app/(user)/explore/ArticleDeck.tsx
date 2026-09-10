"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RailArrows } from "@/components/user/RailArrows";
import type { ArticleCard } from "@/lib/articles";

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
export function ArticleDeck({ articles }: { articles: ArticleCard[] }) {
  const railRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

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
    setActive((prev) => (prev === nearest ? prev : nearest));
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          apply();
        });
    };
    apply();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [apply]);

  const goTo = (i: number) => {
    const el = railRef.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    const wide = el.clientWidth >= 640;
    el.scrollTo({
      // 데스크톱은 왼쪽 정렬(24 = .deck 의 sm~ padding-inline).
      // 가운데로 보내면 카드가 여러 장 보이는 화면에서 왼쪽 절반이 또 빈다.
      left: wide
        ? card.offsetLeft - 24
        : card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  return (
    <div>
      {/* relative — 화살표가 레일 위에 얹힌다. 아래 점 줄은 감싸지 않는다
          (같이 감싸면 top-1/2 가 점까지 포함한 가운데라 화살표가 아래로 처진다) */}
      <div className="relative">
        {/* 폭·좌우 여백은 .deck 이 --deck-w 로 함께 잡는다(globals.css) */}
        <ul ref={railRef} className="deck -mx-4 flex gap-3 sm:-mx-6">
          {articles.map((a, i) => (
            <li key={a.id} className="deck-card shrink-0">
              <Link
                href={`/articles/${encodeURIComponent(a.slug)}`}
                className="group block overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line"
              >
                <span className="relative block aspect-[4/5] w-full overflow-hidden bg-surface-2">
                  {a.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.cover_url}
                      alt={a.cover_alt || a.title}
                      loading={i === 0 ? undefined : "lazy"}
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

                  {/* 번호 — 몇 번째 글인지. 카드가 한 장씩 보이니 위치 감각이 필요하다. */}
                  <span className="absolute left-4 top-4 font-display text-[11px] italic tabular-nums text-white/85">
                    {String(i + 1).padStart(2, "0")} /{" "}
                    {String(articles.length).padStart(2, "0")}
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

      {/* 점 — 어디쯤인지. 눌러서 이동도 된다. */}
      {articles.length > 1 && (
        <div className="mt-1 flex justify-center gap-1.5">
          {articles.map((a, i) => (
            <button
              key={a.id}
              type="button"
              aria-label={`${i + 1}번째 글 보기`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === active
                  ? "w-5 bg-brand"
                  : "w-1.5 bg-line-strong hover:bg-fg/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

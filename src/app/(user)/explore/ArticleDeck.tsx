"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
 * 가운데에서 멀어질수록 작아지고 기울고 어두워진다 — 뒤에 카드가 쌓여 있는 것처럼 보인다.
 */
export function ArticleDeck({ articles }: { articles: ArticleCard[] }) {
  const railRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  const apply = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let nearest = 0;
    let nearestDist = Infinity;

    Array.from(el.children).forEach((child, i) => {
      const s = child as HTMLElement;
      const dist = s.offsetLeft + s.offsetWidth / 2 - center;
      const t = Math.min(1, Math.abs(dist) / s.offsetWidth); // 0 = 정중앙
      const dir = dist < 0 ? -1 : 1;
      s.style.transform = `scale(${(1 - 0.12 * t).toFixed(3)}) rotate(${(dir * 2.4 * t).toFixed(2)}deg)`;
      s.style.opacity = (1 - 0.35 * t).toFixed(2);
      s.style.zIndex = String(100 - Math.round(t * 100));
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
      if (!raf) raf = requestAnimationFrame(() => {
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
    el.scrollTo({
      left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  return (
    <div>
      {/* 폭·좌우 여백은 .deck 이 --deck-w 로 함께 잡는다(globals.css) */}
      <ul ref={railRef} className="deck -mx-4 flex gap-3 sm:-mx-6">
        {articles.map((a, i) => (
          <li
            key={a.id}
            className="deck-card shrink-0"
          >
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
                  {String(i + 1).padStart(2, "0")} / {String(articles.length).padStart(2, "0")}
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
                i === active ? "w-5 bg-brand" : "w-1.5 bg-line-strong hover:bg-fg/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

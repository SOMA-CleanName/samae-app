"use client";

import Link from "next/link";
import { mpTrack } from "@/lib/mixpanel";
import type { FeedInterstitial } from "@/lib/feed-interstitials";

/**
 * 피드 사이에 끼는 카드.
 *
 * 사진 카드와 확실히 갈려야 한다 — 사진인 줄 알고 눌렀는데 다른 데로 가면
 * 잘못 눌렀다고 느낀다. 테두리나 색 띠를 두르는 걸로는 부족했다. 결국
 * '조금 다른 사진 카드'로 보였다.
 *
 * 잉크 판에 사진을 작게 넣어도 봤는데, 사진이 갇혀 답답하고 결국 '어두운 카드'였다.
 * 사진을 작게 만드는 방향 자체가 틀렸다 — 사진 서비스의 지면에서 사진을 줄이면
 * 무드가 같이 죽는다.
 *
 * 그래서 **사진을 카드 전체로 키우고, 색을 바꾼다.**
 *   · 읽을거리 → **잡지 표지.** 사진이 카드를 다 채우되 잉크로 톤을 눌러(듀오톤)
 *                 컬러 사진 격자 안에서 혼자 빛바랜 인쇄물처럼 보인다.
 *                 위엔 브랜드 규칙선 + Fraunces 이탤릭 라벨, 아래엔 큰 흰 제목.
 *                 **손을 대면 원래 색으로 돌아온다** — 안에 컬러 사진이 있다는 신호이자,
 *                 톤을 누른 게 처리이지 사진 자체가 아니라는 걸 알려 준다.
 *   · 작가     → **컨택트 시트.** 필름 판에 사진 세 컷과 퍼포레이션(구멍).
 *                 사진관에서 쓰던 물건이라 이 서비스에서 겉돌지 않는다.
 *
 * 격자에서 갈리는 건 '어둡다'가 아니라 **채도**다. 주변이 전부 컬러라 저채도 한 장이
 * 제일 먼저 눈에 걸린다. 어둡게만 하면 어두운 사진과 섞인다.
 */
export function FeedInterstitialCard({ item }: { item: FeedInterstitial }) {
  const track = () =>
    mpTrack("Click Feed Interstitial", { kind: item.kind, href: item.href });

  if (item.kind === "read") {
    return (
      <Link
        href={item.href}
        onClick={track}
        className="fi fi-cover group relative block overflow-hidden rounded-xl bg-fg"
      >
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="fi-img absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* 잉크 — 사진 위를 눌러 톤을 통일하고 흰 글씨가 어디서나 읽히게 한다 */}
        <span aria-hidden className="fi-ink absolute inset-0" />

        <span className="relative flex aspect-[4/5] flex-col justify-between p-3.5 text-white">
          <span className="block">
            <span aria-hidden className="mb-2 block h-[2px] w-6 bg-brand" />
            <span className="font-display text-[11px] italic leading-none text-white/85">
              {item.badge}
            </span>
          </span>

          <span className="block">
            <span className="line-clamp-3 block text-[15px] font-extrabold leading-[1.25] tracking-[-0.02em]">
              {item.title}
            </span>
            {/* 장소는 한 줄이 사실(구·장수)이라 싣는다. 글은 제목만으로 충분하다. */}
            {item.tone === "place" && item.lead && (
              <span className="mt-1 line-clamp-1 block text-[11px] text-white/70">{item.lead}</span>
            )}
            <span className="mt-2.5 flex items-center justify-between border-t border-white/25 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
              <span>{item.tone === "story" ? "Read" : "Visit"}</span>
              <span className="fi-more" aria-hidden>
                →
              </span>
            </span>
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={track}
      className="fi fi-film group block rounded-xl bg-fg p-1 text-bg"
    >
      {/* 퍼포레이션 — 필름 가장자리 구멍. 페이지 배경색으로 뚫어 놓은 것처럼 보인다. */}
      <span aria-hidden className="fi-perf block" />

      <span className="grid grid-cols-3 gap-1 px-1">
        {item.imageUrls.slice(0, 3).map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={u}
            alt=""
            loading="lazy"
            className="fi-img aspect-square w-full object-cover"
          />
        ))}
      </span>

      <span aria-hidden className="fi-perf block" />

      <span className="block px-2.5 pb-2.5 pt-1.5">
        <span className="block text-[9.5px] font-bold uppercase tracking-[0.18em] text-bg/50">
          작가
        </span>
        <span className="mt-1 flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-body-sm font-bold tracking-tight">
            {item.displayName}
          </span>
          <span className="fi-more shrink-0 text-[11px] text-brand" aria-hidden>
            →
          </span>
        </span>
      </span>
    </Link>
  );
}

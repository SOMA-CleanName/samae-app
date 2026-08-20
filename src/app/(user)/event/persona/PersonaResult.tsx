"use client";

import Link from "next/link";
import { useState } from "react";
import { mpTrack } from "@/lib/mixpanel";
import { Button } from "@/components/ui";
import type { PersonaSuccess } from "./view-types";

// 결과 화면 — 이 기능의 유일한 공유 자산이다.
//
// 디자인 원칙:
// 1) 사매 시스템 안에 있는다. 토큰만 쓰고(테마 자동 추종), 다크 독립 섬을 만들지 않는다.
// 2) 기억점은 '다크 테마'가 아니라 **내 피드에서 뽑은 팔레트**다. 사람마다 다른 색이
//    히어로 워시와 스와치로 깔려서, 같은 레이아웃인데 결과마다 다른 인상을 준다.
// 3) 팔레트 색은 **장식에만** 쓴다. 사용자 사진에서 뽑은 색이라 밝을 수도 어두울 수도 있어
//    텍스트·게이지에 쓰면 대비가 무너진다. 텍스트는 항상 토큰 색.

const BIG5_LABEL: Record<string, string> = {
  openness: "개방성",
  conscientiousness: "성실성",
  extraversion: "외향성",
  agreeableness: "우호성",
  emotionalStability: "정서안정",
};

function cardHref(r: PersonaSuccess): string {
  const params = new URLSearchParams({
    label: r.shoot.shootPersonaLabel,
    palette: r.shoot.colorPalette.slice(0, 5).join(","),
  });
  // 추천 사진 상위 3장 — 카드의 시선을 끄는 실제 상품 (share/route 가 자사 호스트만 허용)
  for (const p of r.photos.slice(0, 3)) params.append("p", p.url);
  return `/event/persona/share?${params.toString()}`;
}

// 추천 사진 1장. 첫 장(big)은 넓게, 나머지는 2열 그리드.
function PersonaPhoto({
  photo,
  rank,
  purposeKey,
  big = false,
}: {
  photo: { id: string; url: string };
  rank: number;
  purposeKey: string;
  big?: boolean;
}) {
  return (
    <Link
      href={`/photos/${photo.id}`}
      onClick={() => mpTrack("Click Persona Photo", { photo_id: photo.id, rank, purpose_key: purposeKey })}
      className={
        "group relative block cursor-pointer overflow-hidden bg-surface-2 " +
        (big ? "mt-3 aspect-[4/5] rounded-2xl" : "aspect-[3/4] rounded-xl")
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt="추천 사진 — 누르면 상세로 이동"
        // 첫 장은 화면에 바로 보이므로 지연 로딩하지 않는다 (LCP)
        loading={big ? "eager" : "lazy"}
        fetchPriority={big ? "high" : undefined}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      {/* 탭하면 이동한다는 걸 모바일에서도 알 수 있게 — 호버 없이 항상 보이는 칩 */}
      <span
        aria-hidden
        className={
          "absolute flex items-center gap-1 rounded-full bg-black/55 text-white backdrop-blur-sm " +
          (big ? "bottom-2.5 right-2.5 px-2.5 py-1 text-caption" : "bottom-1.5 right-1.5 p-1")
        }
      >
        {big && <span>사진 보러가기</span>}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={big ? "h-3.5 w-3.5" : "h-3 w-3"}>
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </span>
    </Link>
  );
}

// 등장 순서를 주는 헬퍼 — 스크롤 없이 첫 화면에서 팔레트→라벨→문장이 차례로 들어온다.
function reveal(i: number) {
  return { animation: "persona-reveal 560ms cubic-bezier(0.22,1,0.36,1) both", animationDelay: `${i * 90}ms` };
}

export default function PersonaResult({
  result,
  onRestart,
  shared = false,
}: {
  result: PersonaSuccess;
  /** 내 결과 화면에서만 쓰는 '다시 하기'. 공유 링크 화면에서는 없다. */
  onRestart?: () => void;
  /** 공유 링크로 들어온 화면 — CTA 를 '나도 해보기' 로 바꾼다. */
  shared?: boolean;
}) {
  const { persona, shoot, photos } = result;
  const [copied, setCopied] = useState(false);
  const palette = shoot.colorPalette.length ? shoot.colorPalette.slice(0, 5) : ["#ff3d2e", "#241a18", "#f3f1ec"];

  // 결과 페이지 링크를 공유한다 — 친구가 열면 같은 결과를 보고 자기 분석으로 넘어간다.
  // (저장 실패로 shareId 가 없으면 카드 이미지만 제공)
  async function share() {
    mpTrack("Share Persona", {
      purpose_key: shoot.purposeKey,
      surface: result.shareId ? "link" : "card",
      shared_view: shared,
    });
    if (!result.shareId) {
      window.open(cardHref(result), "_blank", "noopener");
      return;
    }
    const url = `${window.location.origin}/event/persona/r/${result.shareId}`;
    const title = `${shoot.shootPersonaLabel} · 내 촬영 페르소나`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      // alert 는 흐름을 끊는다 — 버튼 라벨이 잠깐 바뀌는 것으로 충분
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* 사용자가 공유를 취소한 경우 — 무시 */
    }
  }

  return (
    <div className="font-kr">
      {/* ── 히어로 ── */}
      <section className="relative overflow-hidden px-6 pb-12 pt-16 text-center">
        {/* 내 팔레트에서 뽑은 워시 — 장식 전용이라 대비에 영향 없음 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{
            background: `radial-gradient(110% 80% at 50% 0%, ${palette[0]}2e 0%, transparent 70%)`,
          }}
        />

        <div className="relative mx-auto max-w-lg">
          <p style={reveal(0)} className="font-display text-body-sm italic text-brand">
            samae · 내 촬영 페르소나
          </p>

          {/* 라벨은 한글이다 — Fraunces italic 을 씌우면 합성 이탤릭이라 지저분해진다.
              (Fraunces 는 위 eyebrow 의 'samae' 에만) */}
          <h1
            style={reveal(1)}
            className="mt-3 text-balance text-[1.9rem] font-extrabold leading-[1.25] tracking-tight sm:text-[2.3rem]"
          >
            {shoot.shootPersonaLabel}
          </h1>

          {/* 팔레트 — 이 결과의 지문. 장식이므로 스크린리더에서는 감춘다 */}
          <ul aria-hidden style={reveal(2)} className="mt-6 flex items-center justify-center gap-2">
            {palette.map((c, i) => (
              <li
                key={`${c}-${i}`}
                title={c}
                className="h-8 w-8 rounded-full ring-1 ring-fg/10"
                style={{ background: c }}
              />
            ))}
          </ul>

          <p style={reveal(3)} className="mx-auto mt-7 max-w-md text-pretty text-body leading-relaxed text-muted">
            {shoot.psychHook}
          </p>
        </div>
      </section>

      {/* ── 어울리는 사진 ── 히어로 바로 다음.
          사람들은 '내 성격 분석표'보다 **사진**을 먼저 보고 싶어한다.
          텍스트 리포트를 먼저 깔면 스크롤 중에 이탈하고, 이 기능의 결과물(사진)에 닿지 못한다. */}
      {photos.length > 0 && (
        <section className="mx-auto max-w-lg px-6 pb-12">
          <h2 className="text-caption font-semibold uppercase tracking-wider text-muted">
            당신의 사진과 닮은 사매 사진
          </h2>
          <p className="mt-1.5 text-body-sm text-muted">
            피드와 색·빛·구도가 가장 가까운 순서예요.
            <br />
            사진을 누르면 작가와 가격을 볼 수 있어요.
          </p>

          {/* 첫 장은 크게 — 작은 타일 9개보다 큰 한 장이 먼저 눈에 박힌다.
              나머지는 3열로 압축한다. 2열로 8장을 깔면 사진 구간만 화면 4개 분량이 되어
              뒤의 설명·CTA 까지 아무도 안 내려간다. */}
          <PersonaPhoto photo={photos[0]} rank={1} purposeKey={shoot.purposeKey} big />

          {photos.length > 1 && (
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {photos.slice(1, 7).map((p, i) => (
                <PersonaPhoto key={p.id} photo={p} rank={i + 2} purposeKey={shoot.purposeKey} />
              ))}
            </div>
          )}

          {shoot.locations.length > 0 && (
            <p className="mt-4 text-center text-body-sm text-muted">
              어울리는 로케이션 · {shoot.locations.slice(0, 3).join(" · ")}
            </p>
          )}
        </section>
      )}

      {/* ── 왜 이 무드인지 ── */}
      {shoot.moodReasons.length > 0 && (
        <section className="mx-auto max-w-lg px-6 pb-12">
          <h2 className="text-caption font-semibold uppercase tracking-wider text-muted">왜 이 무드가 어울릴까</h2>
          <div className="mt-3 space-y-3">
            {shoot.moodReasons.map((m, i) => {
              // LLM 이 근거로 지목한 '바로 그 사진' 썸네일 — 판단이 검증 가능해진다.
              // (photoIndexes 는 1-base · 공유 링크로 열면 sampleThumbs 가 없어 자연히 생략)
              const evidence = (m.photoIndexes ?? [])
                .map((n) => result.sampleThumbs?.[n - 1])
                .filter((t): t is string => !!t);
              return (
                // 관찰(signal)과 결론(why)을 한 문단에 붙이면 뭉쳐서 안 읽힌다.
                // 사진에서 본 것 → 그래서 이 무드, 라는 논리가 보이도록 분리한다.
                <div key={i} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-title font-semibold">{m.moodTitle}</p>
                    {evidence.length > 0 && (
                      <div className="flex shrink-0 -space-x-2">
                        {evidence.map((src, j) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={j}
                            src={src}
                            alt={`근거가 된 내 피드 사진 ${j + 1}`}
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded-lg border-2 border-surface object-cover shadow-card"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="mt-2 border-l-2 border-brand/40 pl-3 text-body-sm leading-relaxed text-muted">
                    {m.signal}
                  </p>
                  <p className="mt-2 text-body-sm leading-relaxed">{m.why}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 당신은 이런 사람 ── */}
      <section className="mx-auto max-w-lg px-6 pb-12">
        <h2 className="text-caption font-semibold uppercase tracking-wider text-muted">당신은 이런 사람</h2>
        <p className="mt-2.5 text-h2 font-bold leading-snug">{persona.oneLiner}</p>

        <div className="mt-6 space-y-2.5">
          {Object.entries(persona.bigFive).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-caption text-muted">{BIG5_LABEL[k] ?? k}</span>
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={v.score}
                aria-label={BIG5_LABEL[k] ?? k}
              >
                {/* 게이지는 브랜드색 고정 — 팔레트를 쓰면 밝은 색일 때 안 보인다 */}
                <div className="h-full rounded-full bg-brand" style={{ width: `${v.score}%` }} />
              </div>
              <span className="w-7 shrink-0 text-right text-caption tabular-nums text-muted">
                {v.score}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
          <p className="text-body-sm">
            <span className="font-semibold text-brand">{persona.attachment.label}</span>
            <span className="text-muted"> · {persona.attachment.reason}</span>
          </p>
          <ul className="mt-3 space-y-1.5">
            {persona.evidence.slice(0, 4).map((e, i) => (
              <li key={i} className="text-body-sm leading-relaxed text-muted">
                — {e}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 전환 CTA ── */}
      {/* 셸의 main 이 이미 pb-28 을 갖고 있어 여기서 더 띄우면 빈 공간만 커진다 */}
      <section className="mx-auto max-w-lg space-y-2.5 px-6 pb-4">
        <Button
          href="/"
          variant="brand"
          size="lg"
          fullWidth
          onClick={() =>
            mpTrack("Click Persona CTA", {
              purpose_key: shoot.purposeKey,
              mood_count: shoot.moodIds.length,
            })
          }
        >
          이 무드로 사진 더 보기
        </Button>
        <Button type="button" variant="secondary" size="lg" fullWidth onClick={share} aria-live="polite">
          {copied ? "링크를 복사했어요 — 친구에게 붙여넣어 보세요!" : result.shareId ? "결과 링크 공유하기" : "결과 공유 카드 만들기"}
        </Button>
        {shared ? (
          <Button
            href="/event/persona"
            variant="ghost"
            size="md"
            fullWidth
            onClick={() => mpTrack("Click Persona Try Mine", { purpose_key: shoot.purposeKey })}
          >
            나도 내 페르소나 알아보기 →
          </Button>
        ) : (
          onRestart && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              fullWidth
              onClick={() => {
                mpTrack("Restart Persona", { purpose_key: shoot.purposeKey });
                onRestart();
              }}
            >
              다른 아이디로 다시 하기
            </Button>
          )
        )}
      </section>

      <style jsx global>{`
        @keyframes persona-reveal {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="persona-reveal"] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

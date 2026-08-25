"use client";

import Link from "next/link";
import { useState } from "react";
import { mpTrack } from "@/lib/mixpanel";
import { Button } from "@/components/ui";
import type { PersonaSuccess } from "./view-types";
import { PersonaMotion, reveal, pop, grow } from "./motion";

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
      {/* 첫 장은 '왜 이게 맨 위인가'를 말해준다 — 랭킹이라는 걸 알면 그리드도 순서로 읽힌다 */}
      {big && (
        <span
          aria-hidden
          className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2.5 py-1 text-caption font-medium text-white backdrop-blur-sm"
        >
          피드와 가장 닮은 1장
        </span>
      )}
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

// 섹션 소제목 — eyebrow 만 반복하면 스크롤 중에 구획이 흐릿해진다.
// 브랜드색 짧은 획을 앞세워 '여기서 화제가 바뀐다'는 신호를 준다.
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wider text-muted">
      <span aria-hidden className="h-px w-4 shrink-0 bg-brand" />
      {children}
    </h2>
  );
}

// AI 장문은 수정할 수 없으니 **표시**로 끊는다 — 문장마다 줄을 바꾸면
// 한 덩어리 문단보다 스캔이 훨씬 빠르다 (모바일 22자/줄 기준).
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 상세 접기 — '한 줄 핵심(크게) → 상세(작게·접기)' 위계의 접기 쪽.
// 네이티브 details 라 상태·계측 없이 표시만 바뀐다.
function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group mt-3">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 py-1 text-caption font-medium text-muted transition-colors duration-200 hover:text-fg [&::-webkit-details-marker]:hidden">
        {label}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="mt-1.5">{children}</div>
    </details>
  );
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
        {/* 내 팔레트에서 뽑은 워시 — 장식 전용이라 대비에 영향 없음.
            도미넌트(0)를 위에서, 보조색(1)을 오른쪽 아래에서 아주 옅게 겹쳐
            단색 그라데이션보다 '내 피드 색감'이라는 인상을 준다. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{
            background:
              `radial-gradient(110% 80% at 50% 0%, ${palette[0]}2e 0%, transparent 70%),` +
              `radial-gradient(70% 60% at 85% 75%, ${palette[1] ?? palette[0]}1a 0%, transparent 70%)`,
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

          {/* 팔레트 — 이 결과의 지문. 장식이므로 스크린리더에서는 감춘다.
              도미넌트(첫 칩)는 한 치수 크게, 나머지는 도장 찍듯 차례로 팝. */}
          <ul aria-hidden style={reveal(2)} className="mt-6 flex items-center justify-center gap-2">
            {palette.map((c, i) => (
              <li
                key={`${c}-${i}`}
                title={c}
                className={
                  "rounded-full shadow-card ring-1 ring-fg/10 " + (i === 0 ? "h-10 w-10" : "h-8 w-8")
                }
                style={{ background: c, ...pop(i, 260) }}
              />
            ))}
          </ul>

          {/* 후킹 카피 — 이 화면의 첫 본문. muted 한 덩어리로 깔면 안 읽혀서
              문장마다 줄을 바꾸고 본문 대비(fg)로 올린다. */}
          <div style={reveal(3)} className="mx-auto mt-7 max-w-md space-y-1.5">
            {splitSentences(shoot.psychHook).map((s, i) => (
              <p key={i} className="text-pretty text-body leading-relaxed text-fg/85">
                {s}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ── 어울리는 사진 ── 히어로 바로 다음.
          사람들은 '내 성격 분석표'보다 **사진**을 먼저 보고 싶어한다.
          텍스트 리포트를 먼저 깔면 스크롤 중에 이탈하고, 이 기능의 결과물(사진)에 닿지 못한다. */}
      {photos.length > 0 && (
        <section className="mx-auto max-w-lg px-6 pb-12">
          <SectionTitle>당신의 피드와 닮은 사진</SectionTitle>
          <p className="mt-1.5 text-body-sm leading-relaxed text-muted">
            색·빛·구도가 가까운 순서예요. 누르면 작가와 가격이 보여요.
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
            // 문장 한 줄보다 칩이 '가서 찍을 수 있는 곳'처럼 읽힌다
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-caption text-muted">어울리는 로케이션</span>
              {shoot.locations.slice(0, 3).map((loc) => (
                <span
                  key={loc}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-caption font-medium text-fg/80"
                >
                  {loc}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 당신은 이런 사람 ──
          무드 근거보다 먼저 둔다 — '나'에 대한 결론을 읽고 나야
          '그래서 이 무드'라는 다음 섹션이 근거로 읽힌다. */}
      <section className="mx-auto max-w-lg px-6 pb-12">
        <SectionTitle>당신은 이런 사람</SectionTitle>
        {/* 한 줄 핵심 — 이 섹션에서 크게 읽히는 건 이 문장 하나면 된다 */}
        <p className="mt-2.5 text-pretty text-h2 font-bold leading-snug">{persona.oneLiner}</p>

        <div className="mt-6 space-y-2.5">
          {Object.entries(persona.bigFive).map(([k, v], i) => (
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
                {/* 게이지는 브랜드색 고정 — 팔레트를 쓰면 밝은 색일 때 안 보인다.
                    width 는 값 그대로 두고 scaleX 로 차오르게 (reduced-motion 이면 즉시 최종 상태) */}
                <div
                  className="h-full origin-left rounded-full bg-brand"
                  style={{ width: `${v.score}%`, ...grow(i) }}
                />
              </div>
              <span className="w-7 shrink-0 text-right text-caption tabular-nums text-muted">
                {v.score}
              </span>
            </div>
          ))}
        </div>

        {/* 애착유형 — 라벨은 칩으로 세우고 이유는 본문 대비로 한 줄.
            근거 목록은 길어서 기본 접힘 (읽고 싶은 사람만 편다). */}
        <div className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-card">
          <span className="inline-flex rounded-full bg-brand-soft px-2.5 py-1 text-caption font-semibold text-brand-ink">
            {persona.attachment.label}
          </span>
          <p className="mt-2.5 text-body-sm leading-relaxed">{persona.attachment.reason}</p>
          {persona.evidence.length > 0 && (
            <Disclosure label={`판단 근거 ${Math.min(persona.evidence.length, 4)}가지 보기`}>
              <ul className="space-y-2">
                {persona.evidence.slice(0, 4).map((e, i) => (
                  <li key={i} className="flex gap-2 text-body-sm leading-relaxed text-muted">
                    <span aria-hidden className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-brand" />
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
        </div>
      </section>

      {/* ── 왜 이 무드인지 ── '당신은 이런 사람' 뒤에 온다 (결론 → 근거 순서) */}
      {shoot.moodReasons.length > 0 && (
        <section className="mx-auto max-w-lg px-6 pb-12">
          <SectionTitle>왜 이 무드가 어울릴까</SectionTitle>
          <div className="mt-3 space-y-3">
            {shoot.moodReasons.map((m, i) => {
              // LLM 이 근거로 지목한 '바로 그 사진' 썸네일 — 판단이 검증 가능해진다.
              // (photoIndexes 는 1-base · 공유 링크로 열면 sampleThumbs 가 없어 자연히 생략)
              const evidence = (m.photoIndexes ?? [])
                .map((n) => result.sampleThumbs?.[n - 1])
                .filter((t): t is string => !!t);
              return (
                // 카드마다 핵심은 결론(why) 하나 — 본문 대비로 크게.
                // 관찰(signal)은 상세라 기본 접힘. 문단 두 개를 나란히 깔면 덩어리로 안 읽힌다.
                <div key={i} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-baseline gap-2 text-title font-semibold leading-snug">
                      <span aria-hidden className="text-caption font-semibold tabular-nums text-brand">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {m.moodTitle}
                    </p>
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
                  <p className="mt-2.5 text-pretty text-body leading-relaxed">{m.why}</p>
                  <Disclosure label="피드에서 본 신호">
                    <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-body-sm leading-relaxed text-muted">
                      {m.signal}
                    </p>
                  </Disclosure>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
        <Button
          type="button"
          variant="secondary"
          size="lg"
          fullWidth
          onClick={share}
          aria-live="polite"
          leftIcon={
            copied ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-success" aria-hidden>
                <path d="m5 13 4 4L19 7" />
              </svg>
            ) : (
              // 공유(내보내기) 아이콘 — 텍스트만 있을 때보다 버튼의 역할이 한눈에 잡힌다
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                <path d="M12 15V4m0 0 4 4m-4-4L8 8" />
                <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
              </svg>
            )
          }
        >
          {copied ? "링크를 복사했어요" : result.shareId ? "결과 링크 공유하기" : "결과 공유 카드 만들기"}
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

      <PersonaMotion />
    </div>
  );
}

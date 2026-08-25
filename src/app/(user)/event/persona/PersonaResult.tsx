"use client";

import Link from "next/link";
import { useState } from "react";
import { mpTrack } from "@/lib/mixpanel";
import { Button } from "@/components/ui";
import type { PersonaSuccess } from "./view-types";
import { PersonaMotion, reveal, pop, grow } from "./motion";

// 결과 화면 — "공유하고 싶은 리포트 카드" (2026-08-25 전면 재설계).
//
// 디자인 원칙:
// 1) 스크롤형 나열이 아니라 **카드 한 장 한 장이 완결된 뷰**다. 어느 카드를 캡처해도
//    그 자체로 인스타에 올릴 수 있어야 한다 — 카드마다 구획·위계·samae 표식을 갖춘다.
// 2) 기억점은 **내 피드에서 뽑은 팔레트**다. 히어로 카드는 도미넌트 색을 배경 전체로
//    쓰고(워시가 아니라 테마), 잉크 색은 명도로 자동 선택해 대비를 지킨다.
// 3) 팔레트를 텍스트에 쓰는 건 히어로 카드 안에서만 — 나머지 카드는 전부 토큰 색.
// 4) 카피는 생성 단계에서 이미 짧다(combined.ts v3 글자수 제한). 구버전 저장 결과의
//    긴 문장도 깨지지 않고 흐르게만 잡아둔다 (접이식 불필요).

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

// AI 카피는 문장마다 줄을 바꿔 얹는다 — 한 덩어리 문단보다 카피 톤이 산다.
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── 팔레트 → 히어로 카드 테마 ──────────────────────────────
// 사용자 사진에서 뽑은 색이라 밝기를 예측할 수 없다. 도미넌트 색의 상대 휘도로
// 잉크(글자색)를 고른다. 여기 리터럴 색은 하드코딩 팔레트가 아니라
// "동적 배경 위 대비 보장"을 위한 잉크 페어다 (팔레트 동적 사용 예외 범위).
function heroTheme(palette: string[]) {
  const p0 = palette[0] ?? "#241a18";
  const p1 = palette[1] ?? p0;
  const chan = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  let lum = 0.5;
  try {
    lum = 0.2126 * lin(chan(p0, 1)) + 0.7152 * lin(chan(p0, 3)) + 0.0722 * lin(chan(p0, 5));
  } catch {
    /* 팔레트가 hex 가 아니면 중간값 유지 */
  }
  const dark = lum > 0.35; // 밝은 배경 → 어두운 잉크
  const ink = dark ? "rgba(22,17,13,0.96)" : "rgba(255,252,248,0.98)";
  const soft = dark ? "rgba(22,17,13,0.68)" : "rgba(255,252,248,0.75)";
  const line = dark ? "rgba(22,17,13,0.22)" : "rgba(255,252,248,0.30)";
  return {
    ink,
    soft,
    line,
    bg: {
      backgroundColor: p0,
      backgroundImage: `radial-gradient(130% 95% at 88% 100%, ${p1}40 0%, transparent 62%)`,
    } as React.CSSProperties,
  };
}

// 카드 공통 껍데기 — 모든 카드가 같은 반경·경계·그림자를 가져야 '리포트 한 벌'로 읽힌다.
function Card({
  order,
  className = "",
  children,
}: {
  /** 등장 스태거 순서 */
  order: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={reveal(order)}
      className={`overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card ${className}`}
    >
      {children}
    </section>
  );
}

// 카드 소제목 — 브랜드색 짧은 획 + 캡션. 카드가 바뀌어도 같은 리듬으로 반복된다.
function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wider text-muted">
      <span aria-hidden className="h-px w-4 shrink-0 bg-brand" />
      {children}
    </h2>
  );
}

// 추천 사진 1장. 첫 장(big)은 넓게, 나머지는 3열 그리드.
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
  const theme = heroTheme(palette);
  const keywords = (shoot.keywords ?? []).slice(0, 3); // v3 필드 — 구버전 결과에는 없다
  const evidence = persona.evidence.slice(0, 4);

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
    <div className="mx-auto max-w-lg space-y-3 px-5 pb-4 pt-6 font-kr">
      {/* ── 1. 히어로 카드 — 내 팔레트가 곧 테마. 이 한 장이 공유의 얼굴이다 ── */}
      <section
        style={{ ...reveal(0), ...theme.bg }}
        className="overflow-hidden rounded-3xl p-6 pb-5 shadow-card"
      >
        <div style={reveal(0)} className="flex items-baseline justify-between">
          <span className="font-display text-body italic" style={{ color: theme.ink }}>
            samae
          </span>
          <span
            className="text-caption font-medium uppercase tracking-[0.18em]"
            style={{ color: theme.soft }}
          >
            Shoot Persona
          </span>
        </div>

        {/* 라벨 — 카드에서 가장 큰 활자. 생성 단계에서 8~14자로 제한해 두 줄을 넘지 않는다 */}
        <h1
          style={{ ...reveal(1), color: theme.ink }}
          className="mt-6 text-balance text-[2.1rem] font-extrabold leading-[1.18] tracking-tight"
        >
          {shoot.shootPersonaLabel}
        </h1>

        {/* 키워드 칩 — 나를 요약하는 세 단어 (v3. 구버전 결과에는 없어 조용히 생략) */}
        {keywords.length > 0 && (
          <ul style={reveal(2)} className="mt-4 flex flex-wrap gap-1.5">
            {keywords.map((k) => (
              <li
                key={k}
                className="rounded-full border px-3 py-1 text-caption font-semibold"
                style={{ borderColor: theme.line, color: theme.ink }}
              >
                {k}
              </li>
            ))}
          </ul>
        )}

        {/* 훅 카피 — 문장 단위 줄바꿈. 캡처했을 때 카피처럼 읽히는 부분 */}
        <div
          style={{ ...reveal(3), borderColor: theme.line }}
          className="mt-5 space-y-1 border-t pt-4"
        >
          {splitSentences(shoot.psychHook).map((s, i) => (
            <p key={i} className="text-pretty text-body leading-relaxed" style={{ color: theme.ink }}>
              {s}
            </p>
          ))}
        </div>

        {/* 팔레트 스와치 — 이 결과의 지문. 장식이므로 스크린리더에서 감춘다 */}
        <ul aria-hidden className="mt-6 flex items-center gap-1.5">
          {palette.map((c, i) => (
            <li
              key={`${c}-${i}`}
              title={c}
              className={"rounded-full " + (i === 0 ? "h-7 w-7" : "h-5 w-5")}
              style={{ background: c, boxShadow: `inset 0 0 0 1px ${theme.line}`, ...pop(i, 380) }}
            />
          ))}
          <li className="ml-auto text-caption tabular-nums" style={{ color: theme.soft }}>
            my feed palette
          </li>
        </ul>
      </section>

      {/* ── 2. 닮은 사진 카드 — 이 기능의 결과물(상품)이라 성격보다 먼저 ── */}
      {photos.length > 0 && (
        <Card order={1}>
          <CardTitle>당신의 피드와 닮은 사진</CardTitle>
          <p className="mt-1.5 text-body-sm leading-relaxed text-muted">
            색·빛·구도가 가까운 순서예요. 누르면 작가와 가격이 보여요.
          </p>

          {/* 첫 장은 크게, 나머지는 3열 — 사진 구간이 화면 4개 분량이 되면 아무도 안 내려간다 */}
          <PersonaPhoto photo={photos[0]} rank={1} purposeKey={shoot.purposeKey} big />
          {photos.length > 1 && (
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {photos.slice(1, 7).map((p, i) => (
                <PersonaPhoto key={p.id} photo={p} rank={i + 2} purposeKey={shoot.purposeKey} />
              ))}
            </div>
          )}

          {shoot.locations.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="text-caption text-muted">어울리는 로케이션</span>
              {shoot.locations.slice(0, 3).map((loc) => (
                <span
                  key={loc}
                  className="rounded-full border border-line bg-bg px-3 py-1 text-caption font-medium"
                >
                  {loc}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── 3. 성격 카드 — 결론(나)을 먼저, 무드 근거는 다음 카드에서 ── */}
      <Card order={2}>
        <CardTitle>당신은 이런 사람</CardTitle>
        <p className="mt-2.5 text-pretty text-[1.375rem] font-bold leading-snug">{persona.oneLiner}</p>

        <div className="mt-5 space-y-2.5">
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

        {/* 애착유형 + 근거 — 카피가 짧아져(각 1문장·26자대) 접지 않고 다 보여준다 */}
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-brand-soft px-2.5 py-1 text-caption font-semibold text-brand-ink">
              {persona.attachment.label}
            </span>
            <p className="text-body-sm leading-relaxed">{persona.attachment.reason}</p>
          </div>
          {evidence.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {evidence.map((e, i) => (
                <li key={i} className="flex gap-2 text-body-sm leading-relaxed text-fg/80">
                  <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ── 4. 무드 카드 — 무드당 한 장. 결론 문장 하나 + 관찰 신호 한 줄이면 충분하다 ── */}
      {shoot.moodReasons.map((m, i) => {
        // LLM 이 근거로 지목한 '바로 그 사진' 썸네일 — 판단이 검증 가능해진다.
        // (photoIndexes 는 1-base · 공유 링크로 열면 sampleThumbs 가 없어 자연히 생략)
        const thumbs = (m.photoIndexes ?? [])
          .map((n) => result.sampleThumbs?.[n - 1])
          .filter((t): t is string => !!t);
        return (
          <Card key={i} order={3 + i}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>추천 무드 {String(i + 1).padStart(2, "0")}</CardTitle>
                <p className="mt-2 text-title font-bold leading-snug">{m.moodTitle}</p>
              </div>
              {thumbs.length > 0 && (
                <div className="flex shrink-0 -space-x-2 pt-1">
                  {thumbs.map((src, j) => (
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

            {/* 결론이 본문 — 왜 이 무드인가에 대한 답 한 문장 */}
            <p className="mt-2.5 text-pretty text-body leading-relaxed">{m.why}</p>

            {/* 관찰 신호 — v3 는 명사구 한 줄. 구버전의 긴 문장도 같은 자리에서 그냥 흐른다 */}
            <p className="mt-3 flex items-start gap-1.5 text-caption leading-relaxed text-muted">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-px h-3.5 w-3.5 shrink-0"
                aria-hidden
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>피드에서 본 신호 · {m.signal}</span>
            </p>
          </Card>
        );
      })}

      {/* ── 5. 전환 CTA ── */}
      {/* 셸의 main 이 이미 pb-28 을 갖고 있어 여기서 더 띄우면 빈 공간만 커진다 */}
      <section style={reveal(5)} className="space-y-2.5 pt-1">
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

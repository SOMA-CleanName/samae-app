"use client";

import Link from "next/link";
import { useState } from "react";
import { mpTrack } from "@/lib/mixpanel";
import { Button } from "@/components/ui";
import type { PersonaSuccess, RecoPhoto } from "./view-types";
import { paletteTheme } from "@/lib/persona/palette-theme";
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

// 무드 why 문장 안에서 키워드(성격 카드와의 공통 언어)를 강조한다 —
// "성격 → 무드"가 같은 단어로 이어진다는 걸 눈으로 보여주는 장치.
// 구버전(키워드 없음)이거나 모델이 인용을 빼먹으면 그냥 평문으로 흐른다.
function emphasizeKeyword(text: string, keywords: string[]): React.ReactNode {
  const hit = keywords.find((k) => k && text.includes(k));
  if (!hit) return text;
  const i = text.indexOf(hit);
  return (
    <>
      {text.slice(0, i)}
      <strong className="font-bold text-brand-ink">{hit}</strong>
      {text.slice(i + hit.length)}
    </>
  );
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

// 추천 사진 1장 — 무드 카드 안에서 wide(2칸 가로) 또는 tile(1칸)로 배치된다.
// "왜 이 사진인가"는 파이프라인의 실측값으로만 말한다 — 유사도(1-코사인거리)·
// 씨앗이 된 내 피드 사진. 값이 없으면(폴백·구버전) 조용히 생략.
// (무드 태그 칩은 뺐다 — 사진이 무드 카드 안에 있으니 카드 자체가 그 맥락이다)
function PersonaPhoto({
  photo,
  rank,
  purposeKey,
  wide = false,
  seedThumb,
  alt,
  shared = false,
}: {
  photo: RecoPhoto;
  rank: number;
  purposeKey: string;
  wide?: boolean;
  /** 이 사진을 뽑은 내 피드 사진 썸네일 — "내 이 사진과 닮아서" 근거 칩 */
  seedThumb?: string;
  /** 공유 뷰 — 근거 칩 문구를 3인칭 시점으로 (결과 주인이 아닌 사람이 보는 화면) */
  shared?: boolean;
  /** 사진별 고유 대체 텍스트 (예: "필름-빈티지 무드 추천 사진 2위") */
  alt?: string;
}) {
  // 과장 금지 — 실측 유사도가 절반 이상일 때만 수치로 말한다
  const pct = photo.similarity !== undefined && photo.similarity >= 0.5 ? Math.round(photo.similarity * 100) : null;
  return (
    <Link
      href={`/photos/${photo.id}`}
      onClick={() => mpTrack("Click Persona Photo", { photo_id: photo.id, rank, purpose_key: purposeKey })}
      className={
        "group relative block cursor-pointer overflow-hidden bg-surface-2 rounded-xl " +
        (wide ? "col-span-2 aspect-[16/10]" : "aspect-[4/3]")
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={alt ?? `추천 사진 ${rank}위 — 누르면 상세로 이동`}
        // 전체 1위 사진은 화면에 일찍 보이므로 지연 로딩하지 않는다 (LCP)
        loading={rank === 1 ? "eager" : "lazy"}
        fetchPriority={rank === 1 ? "high" : undefined}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      {/* 배지 — 측정한 사진에만 수치("피드 유사 N%")를, 1위는 랭킹 라벨을.
          유사도가 없는 사진에 측정을 주장하지 않는다 */}
      {wide && (rank === 1 || pct !== null) && (
        <span
          aria-hidden
          className="absolute left-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-caption font-medium text-white backdrop-blur-sm tabular-nums"
        >
          {rank === 1
            ? pct !== null
              ? `피드와 가장 닮은 1장 · 피드 유사 ${pct}%`
              : "추천 1순위"
            : `피드 유사 ${pct}%`}
        </span>
      )}
      {/* 씨앗 근거 — 인과의 반대쪽 끝, 내 피드의 바로 그 사진 */}
      {/* 폭 제한 + 말줄임 — 우측 "사진 보러가기" 칩(≈7rem)과 좁은 화면(390px)에서 겹치지 않게 */}
      {wide && seedThumb && (
        <span
          aria-hidden
          className="absolute bottom-2 left-2 flex max-w-[calc(100%-7.5rem)] items-center gap-1.5 rounded-full bg-black/55 py-1 pl-1 pr-2.5 text-caption text-white backdrop-blur-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={seedThumb} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded-full object-cover" />
          <span className="truncate">{shared ? "이 피드 사진과 닮아서 골랐어요" : "내 이 사진과 닮아서 골랐어요"}</span>
        </span>
      )}
      {/* 타일에도 실측 유사도만 은은하게 — 값이 없으면 아무것도 안 붙는다 */}
      {!wide && pct !== null && (
        <span
          aria-hidden
          className="absolute left-1.5 top-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-caption tabular-nums text-white backdrop-blur-sm"
        >
          피드 유사 {pct}%
        </span>
      )}
      {/* 탭하면 이동한다는 걸 모바일에서도 알 수 있게 — 호버 없이 항상 보이는 칩 */}
      <span
        aria-hidden
        className={
          "absolute flex items-center gap-1 rounded-full bg-black/55 text-white backdrop-blur-sm " +
          (wide ? "bottom-2 right-2 px-2.5 py-1 text-caption" : "bottom-1.5 right-1.5 p-1")
        }
      >
        {wide && <span>사진 보러가기</span>}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={wide ? "h-3.5 w-3.5" : "h-3 w-3"}>
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
  // 뮤트 변환 + 대비 보정(AA 4.5:1 전수 검증)을 마친 테마 — OG 카드와 같은 변환을 쓴다
  const theme = paletteTheme(palette);
  const heroBg: React.CSSProperties = {
    backgroundColor: theme.bg0,
    backgroundImage: `radial-gradient(130% 95% at 88% 100%, ${theme.bg1}59 0%, transparent 62%)`,
  };
  const keywords = (shoot.keywords ?? []).slice(0, 3); // v3 필드 — 구버전 결과에는 없다
  const evidence = persona.evidence.slice(0, 4);
  // 인과 사슬 표기에 쓰는 파이프라인 팩트 — 없으면(공유·구버전) 표기가 조용히 일반형으로 준다
  const sampleCount = result.sampleThumbs?.length ?? 0;
  // 추천 사진을 무드 카드에 나눠 싣는다 — 유사도 순위(rank)는 전체 순서 그대로 유지.
  // 무드 1개면 그 카드가 6장을 흡수(추천 유실 방지), 2~3개면 카드당 3장.
  const moodCount = shoot.moodReasons.length;
  const perMood = moodCount === 1 ? 6 : 3;
  const photosFor = (i: number) => photos.slice(i * perMood, i * perMood + perMood);
  // 무드 수가 변해도 등장 순서가 이어지도록 뒤쪽 요소의 reveal 인덱스를 동적으로
  const tailOrder = 2 + Math.max(moodCount, photos.length > 0 && moodCount === 0 ? 1 : 0);

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
    <div className="mx-auto max-w-lg space-y-4 px-5 pb-4 pt-6 font-kr">
      {/* ── 1. 히어로 카드 — 내 팔레트가 곧 테마. 이 한 장이 공유의 얼굴이다 ── */}
      <section
        style={{ ...reveal(0), ...heroBg }}
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

        {/* 라벨 — 카드에서 가장 큰 활자. 계약은 8~16자지만 모델이 넘길 때가 있어(실측 17~18자)
            길면 활자를 줄여 모바일에서 3줄로 밀리지 않게 한다 */}
        <h1
          style={{ ...reveal(1), color: theme.ink }}
          className={
            "mt-6 text-balance font-extrabold leading-[1.18] tracking-tight " +
            ([...shoot.shootPersonaLabel].length > 16 ? "text-[1.75rem]" : "text-[2.1rem]")
          }
        >
          {shoot.shootPersonaLabel}
        </h1>

        {/* 키워드 칩 — 나를 요약하는 세 단어 (v3. 구버전 결과에는 없어 조용히 생략) */}
        {keywords.length > 0 && (
          <ul style={reveal(2)} className="mt-4 flex flex-wrap gap-1.5">
            {keywords.map((k, i) => (
              <li
                key={`${k}-${i}`}
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
            <p key={i} className="text-pretty text-[1.0625rem] leading-relaxed" style={{ color: theme.ink }}>
              {s}
            </p>
          ))}
        </div>

        {/* 팔레트 스와치 — 이 결과의 지문. 출처(픽셀 추출)를 함께 말해야 지어낸 색이 아님이 보인다 */}
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
            {sampleCount > 0
              ? `피드 사진 ${sampleCount}장에서 추출`
              : shared
                ? "피드에서 추출한 색"
                : "내 피드에서 추출한 색"}
          </li>
        </ul>
        {/* 팔레트 근거 — 이 색들이 어떤 장면에서 왔는지 (v3 생성. 구버전 결과는 생략) */}
        {shoot.paletteReason && (
          <p className="mt-2 text-caption leading-relaxed" style={{ color: theme.soft }}>
            {shoot.paletteReason}
          </p>
        )}
      </section>

      {/* ── 2. 성격 카드 — "나"의 결론이 먼저 와야 뒤의 무드·사진이 근거로 읽힌다 ── */}
      <Card order={1}>
        <CardTitle>당신은 이런 사람</CardTitle>
        {/* 키워드가 문장에 들어 있으면 볼드 에코 — 칩 3중 반복(히어로·성격·무드) 대신
            문장 안에서 공통 언어가 이어진다. 무드 카드의 why 가 같은 단어를 인용한다 */}
        <p className="mt-2.5 text-pretty text-[1.375rem] font-bold leading-snug">
          {emphasizeKeyword(persona.oneLiner, keywords)}
        </p>

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

      {/* ── 3. 무드 카드 — 한 카드 안에서 서사가 완결된다:
             무드 이름 → 내 피드에서 본 신호 → 그래서(키워드 인용) → 그래서 이 사진들 ── */}
      {shoot.moodReasons.map((m, i) => {
        // LLM 이 근거로 지목한 '바로 그 사진' 썸네일 — 판단이 검증 가능해진다.
        // (photoIndexes 는 1-base · 공유 링크로 열면 sampleThumbs 가 없어 자연히 생략)
        const thumbs = (m.photoIndexes ?? [])
          .map((n) => result.sampleThumbs?.[n - 1])
          .filter((t): t is string => !!t);
        const moodPhotos = photosFor(i);
        return (
          <Card key={i} order={2 + i}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>추천 무드 {String(i + 1).padStart(2, "0")}</CardTitle>
                <p className="mt-2 text-title font-bold leading-snug">{m.moodTitle}</p>
              </div>
              {thumbs.length > 0 && (
                // "이 무드라서 이 사진" 관계가 읽히도록 썸네일에 캡션을 붙인다
                <div className="flex shrink-0 flex-col items-end gap-1 pt-1">
                  <div className="flex -space-x-2">
                    {thumbs.map((src, j) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={j}
                        src={src}
                        alt={`이 무드의 근거가 된 내 피드 사진 ${j + 1}`}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-lg border-2 border-surface object-cover shadow-card"
                      />
                    ))}
                  </div>
                  <span className="text-caption text-muted">이 무드의 근거</span>
                </div>
              )}
            </div>

            {/* ① 관찰 — 인과의 출발점이라 본문 대비로 (caption·muted 는 제일 작아서 안 읽혔다).
                사진 번호는 썸네일이 실제로 있을 때만 언급한다 (없는 참조 방지) */}
            <p className="mt-3 flex items-start gap-1.5 text-body-sm leading-relaxed text-fg/75">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-[3px] h-3.5 w-3.5 shrink-0"
                aria-hidden
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>
                {thumbs.length > 0
                  ? `${shared ? "이" : "내"} 피드 ${(m.photoIndexes ?? []).slice(0, 3).join("·")}번 사진에서 본 신호`
                  : "피드에서 본 신호"}
                {/* 절 구분은 "—" — 사진 번호 구분(1·3)의 "·"와 겹쳐 읽히지 않게 */}
                {" — "}
                {m.signal}
              </span>
            </p>

            {/* ② 결론 — 성격 카드의 키워드를 그대로 인용해 "내 성격 → 이 무드"를 잇는다 */}
            <p className="mt-2 text-pretty text-body leading-relaxed">{emphasizeKeyword(m.why, keywords)}</p>

            {/* ③ 그래서 이 사진들 — 이 무드와 가장 가까운 사매 작가 사진 */}
            {moodPhotos.length > 0 && (
              <>
                <p className="mt-4 flex items-center justify-between text-caption font-medium text-muted">
                  <span>그래서 어울리는 사매 사진</span>
                  {i === 0 && <span className="font-normal">누르면 작가·가격이 보여요</span>}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {moodPhotos.map((p, j) => {
                    const rank = i * perMood + j + 1; // 전체 유사도 순위 그대로 (mpTrack rank 유지)
                    return (
                      <PersonaPhoto
                        key={p.id}
                        photo={p}
                        rank={rank}
                        purposeKey={shoot.purposeKey}
                        wide={j === 0}
                        alt={`${m.moodTitle} 무드 추천 사진 ${rank}위 — 누르면 상세로 이동`}
                        shared={shared}
                        seedThumb={
                          j === 0 && p.seedIdx !== undefined
                            ? result.sampleThumbs?.[p.seedIdx]
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        );
      })}

      {/* 무드 근거가 아예 없는 구버전 결과 — 사진만이라도 보여주는 폴백 카드 */}
      {shoot.moodReasons.length === 0 && photos.length > 0 && (
        <Card order={2}>
          <CardTitle>당신의 피드와 닮은 사진</CardTitle>
          <p className="mt-1.5 text-body-sm leading-relaxed text-muted">
            색·빛·구도가 가까운 순서예요. 누르면 작가와 가격이 보여요.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {photos.slice(0, 5).map((p, j) => (
              <PersonaPhoto key={p.id} photo={p} rank={j + 1} purposeKey={shoot.purposeKey} wide={j === 0} />
            ))}
          </div>
        </Card>
      )}

      {/* 어울리는 로케이션 — 칩 대신 정적 텍스트 한 줄 (칩은 눌릴 것처럼 보인다) */}
      {shoot.locations.length > 0 && (
        <p style={reveal(tailOrder)} className="px-1 pt-1 text-caption leading-relaxed text-muted">
          어울리는 로케이션 · {shoot.locations.slice(0, 3).join(" · ")}
        </p>
      )}

      {/* ── 전환 CTA — brand-soft 카드로 감싸 클로징 무대를 만든다 ── */}
      {/* 셸의 main 이 이미 pb-28 을 갖고 있어 여기서 더 띄우면 빈 공간만 커진다 */}
      <section
        style={reveal(tailOrder + 1)}
        className="space-y-2.5 rounded-3xl bg-brand-soft p-5"
      >
        <p className="text-body-sm font-semibold text-brand-ink">이 무드, 사매 작가들이 찍어드려요</p>
        {/* 공유로 들어온 사람의 다음 행동은 '나도 해보기' — 그걸 1순위로 승격 */}
        {shared && (
          <Button
            href="/event/persona"
            variant="brand"
            size="lg"
            fullWidth
            onClick={() => mpTrack("Click Persona Try Mine", { purpose_key: shoot.purposeKey })}
          >
            나도 내 페르소나 알아보기
          </Button>
        )}
        {/* 내 결과 화면에서는 taste 쿠키가 심어져 홈 피드가 이 무드로 재정렬된다 — 약속이 진짜.
            공유 화면은 쿠키가 없으므로 문구를 정직하게 줄인다 */}
        <Button
          href="/"
          variant={shared ? "secondary" : "brand"}
          size="lg"
          fullWidth
          onClick={() =>
            mpTrack("Click Persona CTA", {
              purpose_key: shoot.purposeKey,
              mood_count: shoot.moodIds.length,
            })
          }
        >
          {shared ? "사매에서 사진 더 보기" : "이 무드로 사진 더 보기"}
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
        {!shared && onRestart && (
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
        )}
      </section>

      {/*
        자동 분석 결과라는 사실을 결과 화면에서 밝힌다.

        페르소나는 인스타그램 공개 게시물을 임베딩해 분류하고 사진을 추천하는 **AI 기능**인데,
        결과가 단정적인 문장으로 제시되면 사람은 그것을 판정으로 읽는다. 사실은 취향 참고용
        추천이다. 개인정보 처리방침 §1·§2 에도 같은 취지를 적어 뒀다(자동화된 분석 명시).
      */}
      <p className="mt-6 text-center text-caption leading-relaxed text-faint">
        이 결과는 공개된 게시물을 자동으로 분석해 만든 <b className="font-semibold">취향 추천</b>이에요.
        정확한 진단이 아니라 사진을 고르는 참고용으로 봐주세요.
      </p>

      <PersonaMotion />
    </div>
  );
}

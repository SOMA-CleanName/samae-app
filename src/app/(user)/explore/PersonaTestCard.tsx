"use client";

import Link from "next/link";
import { mpTrack } from "@/lib/mixpanel";

// 촬영 페르소나 진입 카드 — /event/persona 로 이동.
// 취향 테스트와 결과물(taste 쿠키)은 같지만 성격이 다르다:
//   취향 테스트 = 사진 10장 고르기 → 조용한 개인화
//   페르소나    = 인스타 아이디 1개 → 결과 카드·공유 링크 (바이럴 루프의 씨앗)
//
// 디자인: 위 취향 카드와 같은 표면·타이포를 쓰되(같은 시스템 안의 형제),
// 구분은 크롬이 아니라 '팔레트 칩'으로 준다 — 결과 화면에 실제로 나오는 요소라
// 카드 자체가 결과의 예고편이 된다. (다크 독립 섬 금지 — 토큰은 테마를 자동 추종)

const PREVIEW_PALETTE = [
  { hex: "#c8453a", label: "따뜻한 레드" },
  { hex: "#d9a441", label: "황금빛" },
  { hex: "#33564f", label: "딥 그린" },
  { hex: "#efece5", label: "아이보리" },
  { hex: "#2c2320", label: "다크 브라운" },
];

export function PersonaTestCard() {
  return (
    <Link
      href="/event/persona"
      onClick={() => mpTrack("Click Persona Entry", { surface: "explore" })}
      className="group relative block cursor-pointer overflow-hidden rounded-2xl border border-line-strong bg-surface p-5 shadow-card transition-colors duration-200 hover:border-brand/50 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {/* 브랜드 틴트 워시 — 취향 카드(레드 실선 테두리)와 다른 방식으로 시선을 끈다 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-brand-soft opacity-70 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className="relative">
        {/* '입력 = 아이디, 출력 = 어울리는 사진 추천' 이 한눈에 읽혀야 한다.
            '촬영 페르소나'는 결과 화면에서 알게 되는 개념이라 카드에선 앞세우지 않는다.
            인스타그램 글리프(SVG)로 '인스타 기반' 임을 텍스트보다 먼저 전달한다 — 이모지 금지 규칙. */}
        <p className="flex items-center gap-1.5 font-display text-body-sm italic text-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4 not-italic" aria-hidden>
            <rect x="2.5" y="2.5" width="19" height="19" rx="5.2" />
            <circle cx="12" cy="12" r="4.4" />
            <circle cx="17.4" cy="6.6" r="0.4" fill="currentColor" strokeWidth={1.6} />
          </svg>
          인스타 아이디만 넣으면
        </p>

        <h3 className="mt-2 text-xl font-extrabold leading-[1.4] tracking-normal [text-wrap:balance]">
          나랑 <span className="text-brand">어울리는 사진</span>을
          <br />
          바로 추천해드려요.
        </h3>

        <p className="mt-2.5 max-w-[92%] text-body-sm leading-relaxed text-muted">
          피드의 색·빛·구도를 읽어 당신의 무드와 닮은 사매 사진을 골라드려요.
        </p>

        {/* 결과에 실제로 나오는 컬러 팔레트 — 이 카드의 기억점.
            순수 장식이라 스크린리더에는 색 이름 5개가 읽힐 이유가 없다 */}
        <ul aria-hidden className="mt-4 flex items-center gap-1.5">
          {PREVIEW_PALETTE.map((c, i) => (
            <li
              key={c.hex}
              title={c.label}
              className="h-5 w-5 rounded-full ring-1 ring-fg/10 transition-transform duration-300 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
              style={{ background: c.hex, transitionDelay: `${i * 40}ms` }}
            />
          ))}
        </ul>

        <span className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors duration-200 group-hover:bg-brand/90">
          내 아이디로 추천받기
          <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}

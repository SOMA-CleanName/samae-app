"use client";

// 페르소나 이벤트 전용 모션 유틸.
//
// 세 국면(입력 → 분석 → 결과)이 서로 다른 컴포넌트로 통째로 갈리기 때문에,
// 각 화면이 같은 키프레임·같은 이징으로 등장해야 전환이 한 호흡으로 느껴진다.
// 키프레임을 화면마다 복붙하지 않도록 여기 한 곳에 모은다.
//
// 사용법: 화면 루트에 <PersonaMotion /> 을 렌더하고, 등장시킬 요소에 reveal(i)/pop(i).
// reduced-motion 이면 전부 꺼진다 (from-only 키프레임이라 끄면 곧장 최종 상태).

const EASE = "cubic-bezier(0.22,1,0.36,1)"; // ease-out-quint 근사 — 결과 화면 기존 값 유지

/** 아래에서 위로 스르륵 — i 순서대로 90ms 간격 스태거 */
export function reveal(i: number): React.CSSProperties {
  return { animation: `persona-reveal 560ms ${EASE} both`, animationDelay: `${i * 90}ms` };
}

/** 도장 찍듯 팝 — 팔레트 칩·체크 아이콘처럼 작은 요소용 */
export function pop(i: number, baseDelayMs = 0): React.CSSProperties {
  return { animation: `persona-pop 420ms ${EASE} both`, animationDelay: `${baseDelayMs + i * 70}ms` };
}

/** 게이지가 왼쪽에서 차오르는 애니메이션 — width 는 인라인으로, 채움은 scaleX 로 */
export function grow(i: number, baseDelayMs = 200): React.CSSProperties {
  return { animation: `persona-grow 800ms ${EASE} both`, animationDelay: `${baseDelayMs + i * 80}ms` };
}

export function PersonaMotion() {
  // styled-jsx 는 키프레임을 클라이언트에서 주입해 SSR HTML 에 없다 —
  // 공유 링크 착지처럼 서버 HTML 을 먼저 보는 화면에서 하이드레이션 순간
  // 전체가 깜빡였다(키프레임이 없으면 from-only 애니메이션이 즉시 최종 상태로 붙었다가
  // 주입 후 처음부터 다시 돈다). 일반 <style> 은 서버 렌더 HTML 에 그대로 포함된다.
  return (
    <style>{`
      @keyframes persona-reveal {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
      }
      @keyframes persona-pop {
        from {
          opacity: 0;
          transform: scale(0.5);
        }
      }
      @keyframes persona-grow {
        from {
          transform: scaleX(0);
        }
      }
      /* 진행바 위를 지나가는 하이라이트 — '멈춘 게 아니다'는 생존 신호 */
      @keyframes persona-shimmer {
        from {
          transform: translateX(-100%);
        }
        to {
          transform: translateX(400%);
        }
      }
      /* 분석 중 단계 라벨 뒤에서 숨쉬는 점 */
      @keyframes persona-dot {
        0%,
        60%,
        100% {
          opacity: 0.25;
        }
        30% {
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        [style*="persona-"],
        .persona-shimmer {
          animation: none !important;
        }
      }
    `}</style>
  );
}

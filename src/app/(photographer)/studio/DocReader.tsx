"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui";

// 약관 전문 열람 화면 — **끝까지 내려야 동의 버튼이 열린다.**
//
// 예전에는 "○○을(를) 읽었고 동의합니다" 체크박스 옆에 링크만 있었다. 링크는 새 탭으로
// 나가고, 열었는지조차 확인하지 않았다. [모두 동의] 버튼까지 있어서 **네 문서를 한 번도
// 안 열고 통과할 수 있었다.** 약관규제법 3조(명시·설명 의무)에서 사업자가 대는 근거가
// "읽을 기회를 줬다" 인데, 그 기회가 실제로 주어졌는지 아무 기록이 없었다.
//
// 이 화면은 본문을 **지면 안에 깔고**, 바닥에 닿은 사실을 관측한 뒤에만 동의를 연다.
//
// ⚠️ 바닥 감지는 **끝 표지의 위치를 직접 재서** 한다.
//
//    처음엔 IntersectionObserver 로 짰는데, 관측기가 콜백을 안 주는 상황이 있다 —
//    탭이 앞에 없으면 "update the rendering" 단계가 굶어서 IO 가 영영 안 울린다.
//    실측에서 `document.body` 를 관측해도 한 번도 안 울렸다. 그러면 **끝까지 읽어도
//    버튼이 안 열리는** 사고가 나고, 사용자는 왜 막혔는지 알 수가 없다.
//
//    scroll 은 그런 굶주림이 없고, 좌표는 눈으로 확인할 수 있다. 소수점 어긋남은
//    여유(EDGE_SLACK)로 흡수한다. 문서가 화면보다 짧으면 처음부터 열린다(정상이다).

/** 하단 고정 막대 높이 — 그 뒤에 가린 건 읽었다고 볼 수 없다 */
const BOTTOM_BAR_PX = 96;
/** 소수점·줌 배율에서 오는 어긋남 흡수 */
const EDGE_SLACK_PX = 24;

export function DocReader({
  label,
  version,
  summary,
  step,
  total,
  children,
  onAgree,
  onBack,
  agreed,
}: {
  label: string;
  version: string;
  summary: string;
  /** 넷 중 몇 번째인지 — 얼마나 남았는지 보이게 */
  step: number;
  total: number;
  children: ReactNode;
  onAgree: () => void;
  onBack: () => void;
  /** 이미 동의한 문서를 다시 열었을 때 */
  agreed: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [reachedEnd, setReachedEnd] = useState(false);

  useEffect(() => {
    // ⚠️ **rAF 로 감싸지 않는다.** 탭이 앞에 없으면 rAF 가 통째로 멈춰서, 끝까지 읽어도
    //    버튼이 안 열린다. IO 가 안 울린 것도 같은 이유였다. 계산은 요소 하나의
    //    getBoundingClientRect 뿐이라 스크롤마다 그냥 해도 싸다.
    let done = false;
    const check = () => {
      const el = endRef.current;
      if (!el || done) return;
      // 끝 표지의 윗변이 하단 고정 막대 위로 올라오면 "바닥까지 읽었다"
      const top = el.getBoundingClientRect().top;
      const markerSeen = top <= window.innerHeight - BOTTOM_BAR_PX + EDGE_SLACK_PX;
      // 표지 계산과 별개로, **문서 바닥에 닿았으면** 무조건 읽은 것이다.
      // 여백·확대 배율 때문에 표지가 기준선까지 못 올라오는 경우를 덮는다.
      const doc = document.documentElement;
      const atBottom =
        window.innerHeight + window.scrollY >= doc.scrollHeight - EDGE_SLACK_PX;
      if (markerSeen || atBottom) {
        done = true;
        setReachedEnd(true);
      }
    };
    // 문서를 열면 **맨 위부터**. 앞 문서에서 내려온 위치가 남아 있으면 새 문서를
    // 중간부터 보게 되고, 운이 나쁘면 끝 표지가 이미 화면에 있어 그냥 열린다.
    window.scrollTo(0, 0);
    // 첫 검사는 타이머로 미룬다 — 이펙트 본문에서 바로 setState 하면 lint 가 막고,
    // 타이머는 rAF 와 달리 배경 탭에서도 (느려질 뿐) 돈다.
    const first = window.setTimeout(check, 0);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    // 모멘텀 스크롤이 멈춘 뒤 한 번 더. 손을 떼고 미끄러져 바닥에 닿는 경우
    // 마지막 scroll 이 바닥 직전 좌표로 오고 끝나는 일이 있다.
    window.addEventListener("scrollend", check);

    // ⚠️ **이벤트만 믿지 않는다.** 실제로 끝까지 내렸는데 버튼이 안 열리고, 살짝
    //    올렸다 내리면 그제서야 열린다는 신고를 받았다(2026-09-17). 어떤 이벤트가
    //    어디서 새는지 기기마다 다르고, 새는 순간 사용자는 **영영 갇힌다** — 왜 막혔는지
    //    알 방법도 없다. 그래서 열릴 때까지 주기적으로도 확인한다.
    //    재는 건 요소 하나의 getBoundingClientRect 라 싸고, 열리면 스스로 멈춘다.
    let poll = 0;
    const tick = () => {
      check();
      // 열렸으면 더 잴 이유가 없다
      if (done) window.clearInterval(poll);
    };
    poll = window.setInterval(tick, 300);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.removeEventListener("scrollend", check);
    };
  }, []);

  const canAgree = reachedEnd || agreed;

  return (
    <main className="mx-auto max-w-2xl px-5 pb-36 pt-6 font-kr">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-block cursor-pointer text-body-sm font-medium text-muted transition-colors hover:text-fg"
      >
        ← 문서 목록
      </button>

      <p className="text-label uppercase tracking-wide text-brand">
        문서 {step} / {total}
      </p>
      <h1 className="mt-2 text-h1 font-bold tracking-tight">{label}</h1>
      <p className="mt-2 text-body-sm leading-relaxed text-muted">{summary}</p>
      <p className="mt-1.5 text-caption text-faint">버전 {version}</p>

      <div className="mt-8 border-t border-line pt-8">{children}</div>

      {/* 끝 표지 — 이게 보이면 바닥까지 온 것이다 */}
      <div ref={endRef} className="mt-12 rounded-2xl bg-surface-2 px-5 py-5">
        <p className="text-body font-semibold">여기까지가 {label} 전문입니다.</p>
        <p className="mt-1.5 text-body-sm leading-relaxed text-muted">
          동의하면 동의 시각과 버전({version})이 기록으로 남고, 나중에 언제든 다시 확인할 수 있어요.
        </p>
      </div>

      {/* 하단 고정 — 긴 문서에서 버튼을 찾아 다시 올라갈 이유가 없다 */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-5 pb-safe pt-3.5">
          {!canAgree && (
            <p className="mb-2.5 text-center text-caption text-muted">끝까지 읽으면 동의할 수 있어요</p>
          )}
          {/* ⚠️ 잠긴 동안은 **브랜드 레드를 쓰지 않는다.** Button 의 disabled 는 opacity-50 인데,
              빨강이 반투명해지면 "연한 빨강 버튼" 이 되어 눌릴 것처럼 보인다. 잠긴 건
              잠겨 보여야 한다 — 그래서 secondary(외곽선)로 두고, 열릴 때 brand 로 바뀐다.
              색이 바뀌는 것 자체가 "이제 누를 수 있다" 는 신호가 된다. */}
          <Button
            type="button"
            onClick={onAgree}
            disabled={!canAgree}
            variant={canAgree ? "brand" : "secondary"}
            size="lg"
            fullWidth
            className="mb-3.5"
          >
            {agreed ? "동의함 — 목록으로" : "읽었고 동의합니다"}
          </Button>
        </div>
      </div>
    </main>
  );
}

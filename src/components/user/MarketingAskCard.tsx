import { updateMarketingConsent } from "@/app/(user)/settings/actions";

/**
 * 광고성 정보 수신을 **한 번만** 물어보는 카드.
 *
 * 2026-10-09 까지 가입한 519명은 이 동의를 받은 적이 없다. 가입 화면에 항목이 아예
 * 없었기 때문이다. 그런데 **메일·문자로 "동의해주세요" 를 보낼 수는 없다** — 그 발송
 * 자체가 광고성 정보라 무단 발송이 된다(정보통신망법 §50). 서비스 안에서 묻는 건
 * '전송' 이 아니므로 이 길만 남는다.
 *
 * ⚠️ **막지 않는다.** 약관 게이트(TermsConsentGate)는 닫을 수 없는 덮개지만 이건 선택
 *    동의다. 못 넘어가게 만들면 그 자체가 위법이고, 받아낸 동의도 효력이 흔들린다.
 *
 * ⚠️ **두 버튼 다 답으로 기록한다.** "괜찮아요" 도 false + 시각으로 남겨 다시 묻지 않는다.
 *    그냥 닫히기만 하면 영영 답을 못 받고, 계속 띄우면 그건 괴롭히는 것이다.
 *
 * 마음이 바뀌면 계정 설정의 토글에서 언제든 켜고 끈다.
 */
export function MarketingAskCard() {
  return (
    // 하단 플로팅 내비(FloatingNav) 위에 앉힌다 — 내비를 가리면 둘 다 못 쓴다
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 px-3.5 sm:bottom-28">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-line bg-bg/95 p-4 shadow-lg backdrop-blur">
        <p className="text-sm font-medium text-fg">이벤트·혜택 소식 받아보실래요?</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          새 작가 · 할인 · 시즌 촬영 소식을 보내드려요.{" "}
          <b className="text-fg/80">예약·입금 같은 거래 안내는 이 선택과 상관없이</b> 그대로 갑니다.
        </p>
        <form className="mt-3 flex gap-2">
          {/*
            버튼 둘이 같은 이름으로 다른 값을 보낸다 — 액션은 "on" 만 동의로 읽는다.
            "괜찮아요" 도 제출이라 거절한 시각이 남고, 그래서 다시 안 묻는다.
          */}
          <button
            formAction={updateMarketingConsent}
            name="marketing"
            value="on"
            className="flex-1 cursor-pointer rounded-full bg-fg py-2.5 text-xs font-semibold text-bg transition-opacity hover:opacity-90"
          >
            소식 받을래요
          </button>
          <button
            formAction={updateMarketingConsent}
            name="marketing"
            value="off"
            className="cursor-pointer rounded-full border border-fg/15 px-4 py-2.5 text-xs font-semibold text-muted transition-colors hover:bg-fg/5"
          >
            괜찮아요
          </button>
        </form>
      </div>
    </div>
  );
}

"use client";

// §4 QA — 결제 게이트 샌드박스.
//
// 화면은 **실제 DepositGate 그대로**다. 여기서 바꾸는 건 두 가지뿐이다:
//   · 예약 데이터 → 가짜 (fixtures.ts)
//   · 서버 액션   → 아무것도 안 하는 함수 (DB·알림·Mixpanel 전부 안 나간다)
//
// 마크업을 베끼지 않는다. 베끼면 실제와 다른 화면을 QA 하게 되고, 그건 QA 가 아니다.
//
// 단계 이동은 키보드로만 한다 — `]` 다음 · `[` 이전 · `0` 처음.
// 화면에 단계 막대를 띄우면 지면이 밀려 실제와 좌표가 달라진다(온보딩 샌드박스와 같은 이유).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DepositGate } from "@/components/booking/DepositGate";
import { QA_ACCOUNT, QA_AMOUNT } from "./fixtures";

type StageKey = "late" | "late-agreed" | "normal" | "paid";

const STAGES: { key: StageKey; label: string }[] = [
  { key: "late", label: "① 임박 예약 · 동의 전 (계좌 가림)" },
  { key: "late-agreed", label: "② 임박 예약 · 동의 후" },
  { key: "normal", label: "③ 여유 예약 (촬영 20일 뒤)" },
  { key: "paid", label: "④ 입금 완료를 이미 누른 뒤" },
];

/** 아무것도 하지 않는 액션 — 샌드박스는 밖으로 나가지 않는다 */
const noop = async (): Promise<void> => {};

export function PaySandbox({
  stage,
  lateShootAt,
  normalShootAt,
  now,
}: {
  stage: string;
  /** 촬영 3일 뒤 — 임박 예약 */
  lateShootAt: string;
  /** 촬영 20일 뒤 — 여유 예약 */
  normalShootAt: string;
  /** 동의·입금 시각으로 쓸 현재 */
  now: string;
}) {
  const router = useRouter();
  const key: StageKey = (STAGES.find((s) => s.key === stage)?.key ?? "late") as StageKey;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = STAGES.findIndex((x) => x.key === key);
      const go = (k: StageKey) => router.push(`/dev/pay?stage=${k}`);
      if (e.key === "]") go(STAGES[Math.min(i + 1, STAGES.length - 1)].key);
      else if (e.key === "[") go(STAGES[Math.max(i - 1, 0)].key);
      else if (e.key === "0") go(STAGES[0].key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, router]);

  const late = key === "late" || key === "late-agreed";
  return (
    <main className="mx-auto max-w-lg px-3.5 sm:px-5 py-8 font-kr">
      <DepositGate
        // 예약 id 가 바뀌면 React 가 게이트를 새로 만든다 — 단계를 옮겼는데
        // 앞 단계의 동의·체크 상태가 남아 있으면 잘못된 화면을 보게 된다
        key={key}
        bookingId={`qa-${key}`}
        amountKrw={QA_AMOUNT}
        shootAt={late ? lateShootAt : normalShootAt}
        shootDate={null}
        lateBookingConsentAt={key === "late-agreed" ? now : null}
        transferMarkedAt={key === "paid" ? now : null}
        account={QA_ACCOUNT}
        markPaidAction={noop}
        agreeAction={noop}
      />
    </main>
  );
}

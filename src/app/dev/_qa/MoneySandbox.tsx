"use client";

// §4 QA — 정산 금액 샌드박스.
//
// 지면은 **실제 컴포넌트 그대로**다. SettlementsBody 는 /studio/settlements 가 쓰는 바로
// 그 컴포넌트이고, BookingMoney 는 어드민 거래 상세의 「금액」 블록 그 자체다.
// 금액도 손으로 적지 않고 resolveFee · computeWithholding 을 돌려 만든다 — 계산이 바뀌면
// 이 화면도 같이 바뀌어야 QA 가 거짓말을 하지 않는다.
//
// 사업자 유형 전환만 샌드박스 장치다. 실제로는 작가가 프로필에서 바꾸는 값이라,
// QA 하려면 계정을 두 개 만들거나 DB 를 직접 고쳐야 한다. 그 수고를 여기서 없앤다.

import Link from "next/link";
import { SettlementsBody } from "@/components/settlement/SettlementsBody";
import { BookingMoney } from "@/components/booking/BookingMoney";
import type { BusinessType } from "@/lib/withholding";
import { qaAdminMoney, qaSettlementRows } from "./fixtures";

/** 아무것도 하지 않는 액션 — 샌드박스는 밖으로 나가지 않는다 */
const noop = async (): Promise<void> => {};

export function MoneySandbox({ type }: { type: BusinessType }) {
  const rows = qaSettlementRows(type);
  const money = qaAdminMoney(type);

  return (
    <div className="font-kr">
      {/* 이 막대는 샌드박스 장치다 — 아래 지면 두 개는 실제 컴포넌트 그대로다 */}
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5 text-caption">
        <span className="text-muted">사업자 유형</span>
        <Toggle active={type === "unregistered"} href="/dev/money?type=unregistered">
          미등록 (원천징수 대상)
        </Toggle>
        <Toggle active={type === "general"} href="/dev/money?type=general">
          일반과세자
        </Toggle>
      </div>

      <SettlementsBody rows={rows} actions={{ ack: noop, dispute: noop }} />

      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <p className="border-t border-line pt-6 text-caption font-semibold text-muted">
          어드민 거래 상세 · 금액
        </p>
        <div className="mt-3 rounded-xl border border-line p-4">
          <BookingMoney b={money} />
        </div>
      </div>
    </div>
  );
}

function Toggle({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-fg px-3 py-1 font-semibold text-bg"
          : "rounded-full border border-line-strong px-3 py-1 text-muted hover:bg-fg/[0.04]"
      }
    >
      {children}
    </Link>
  );
}

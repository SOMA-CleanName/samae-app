"use client";

// 환불·취소 안내 — 고객이 돈을 보내기 직전에 보는 유일한 설명이다.
//
// 세 가지 원칙으로 쓴다 (docs/32 §6):
//  1. 접지 않는다. 약관규제법 제3조상 설명하지 않은 조항은 계약 내용으로 주장할 수 없다.
//     불리한 조항일수록 펼쳐져 있어야 한다.
//  2. "7일" 이 아니라 날짜를 박는다. 고객은 기간을 계산하지 않는다.
//     "9월 6일까지" 가 "7일 이내" 보다 압도적으로 명확하고, 분쟁에서도 강하다.
//  3. 가장 불리한 한 줄은 체크박스 문구에 직접 넣는다(호출부). "정책에 동의합니다" 로는
//     설명 의무를 못 채운다.
//
// 규정의 진실은 docs/32-refund-policy.md, 계산은 lib/refund.ts.
// 숫자를 바꿔야 하면 문서 → refund.ts → 이 문구 순서로 함께 고칠 것.

import { WITHDRAWAL_DAYS, penaltyStart, withdrawalDeadline } from "@/lib/refund";

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

const dateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

export function PolicyNote({
  transferMarkedAt = null,
  shootAt = null,
  shootDate = null,
}: {
  /** 입금을 알린 시각 — 있으면 청약철회 마감을 실제 날짜로 박는다 */
  transferMarkedAt?: string | null;
  shootAt?: string | null;
  shootDate?: string | null;
}) {
  const deadline = withdrawalDeadline(transferMarkedAt);
  const penalty = penaltyStart(shootAt, shootDate);

  return (
    <div className="mt-3 rounded-xl bg-surface-2 p-3">
      <p className="text-caption font-semibold text-fg">환불·취소 안내</p>
      <ul className="mt-1.5 flex list-none flex-col gap-1 text-caption leading-relaxed text-muted">
        <li>· 입금 전에는 언제든 무료로 취소할 수 있어요.</li>
        <li>
          {deadline ? (
            <>
              · <b className="text-fg">{dateTimeFmt.format(deadline)}까지</b> 취소하시면 전액
              환불됩니다.
            </>
          ) : (
            <>
              · <b className="text-fg">결제일로부터 {WITHDRAWAL_DAYS}일</b> 이내에 취소하시면 전액
              환불됩니다.
            </>
          )}
        </li>
        <li>· 이후 취소는 결제 금액의 50%가 위약금으로 부과됩니다.</li>
        <li>
          ·{" "}
          <b className="text-fg">
            {penalty ? `촬영 7일 전(${dateFmt.format(penalty)})부터는` : "촬영 7일 전부터는"} 환불되지
            않습니다.
          </b>{" "}
          작가님이 그 날짜를 비워두시기 때문이에요.
        </li>
        <li>· 작가 사정으로 촬영이 무산되면 전액 환불됩니다.</li>
        <li>
          · <b className="text-fg">작가 개인 계좌로의 직접 송금은 보호받을 수 없어요.</b> 반드시
          사매 계좌로 보내주세요.
        </li>
      </ul>
    </div>
  );
}

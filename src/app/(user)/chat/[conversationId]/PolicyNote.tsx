"use client";

// 환불·취소 안내 — 고객이 돈을 보내기 직전에 보는 유일한 설명이다 (취소환불정책 12조).
//
// 결제 버튼 앞에 셋을 보여준다:
//  1. 위약금 표와, 이 예약을 지금 취소하면 얼마인지
//  2. 촬영까지 7일 이하면 청약철회가 제한된다는 사실
//  3. 사매는 통신판매중개자이고 촬영 계약의 당사자는 작가라는 사실
//
// 원칙 (약관규제법 3조 — 설명하지 않은 조항은 계약 내용으로 주장할 수 없다):
//  · 접지 않는다. 불리한 조항일수록 펼쳐져 있어야 한다.
//  · "7일" 이 아니라 날짜를 박는다. 고객은 기간을 계산하지 않는다.
//
// 규정의 진실은 취소환불정책 1.0, 계산은 lib/refund.ts. 숫자를 바꿔야 하면 정책 → refund.ts → 여기 순서로.

import { PENALTY_BANDS, penaltyStarts } from "@/lib/refund";

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

const DAY_MS = 24 * 60 * 60 * 1000;

export function PolicyNote({
  shootAt = null,
  shootDate = null,
  amountKrw,
  /**
   * 임박 예약(결제 시 촬영 7일 이하)에서 별도 동의를 마친 경우 그때의 위약금 비율(40 | 90).
   * 이때는 "8일 전까지 전액" 같은 문장이 성립하지 않으므로 결론만 말한다.
   */
  lateBookingPct = null,
}: {
  shootAt?: string | null;
  shootDate?: string | null;
  amountKrw: number;
  lateBookingPct?: number | null;
}) {
  const starts = penaltyStarts(shootAt, shootDate);
  const fmt = new Intl.NumberFormat("ko-KR");
  const won = (pct: number) => `₩${fmt.format(Math.round((amountKrw * (100 - pct)) / 100))}`;

  return (
    <div className="mt-3 rounded-xl bg-surface-2 p-3">
      <p className="text-caption font-semibold text-fg">환불·취소 안내</p>

      {lateBookingPct != null ? (
        <ul className="mt-1.5 flex list-none flex-col gap-1 text-caption leading-relaxed text-muted">
          <li>· 입금 전에는 언제든 무료로 취소할 수 있어요.</li>
          <li>
            · <b className="text-fg">촬영이 7일 안쪽이라 입금 후 취소하시면 지불 금액의 {lateBookingPct}%가 위약금으로 빠지고 {won(lateBookingPct)}이 환불됩니다.</b>{" "}
            방금 동의하신 내용이에요.
          </li>
          {lateBookingPct < 90 && starts && (
            <li>· {dateFmt.format(starts.at90)}부터는 위약금이 90%가 됩니다.</li>
          )}
        </ul>
      ) : (
        <ul className="mt-1.5 flex list-none flex-col gap-1 text-caption leading-relaxed text-muted">
          <li>· 입금 전에는 언제든 무료로 취소할 수 있어요.</li>
          {starts ? (
            <>
              <li>
                · <b className="text-fg">{dateFmt.format(new Date(starts.at40.getTime() - DAY_MS))}까지</b>{" "}
                취소하시면 전액 환불됩니다.
              </li>
              <li>
                · <b className="text-fg">{dateFmt.format(starts.at40)}부터</b>는 위약금 40%를 뺀 {won(40)},{" "}
                <b className="text-fg">{dateFmt.format(starts.at90)}부터</b>는 위약금 90%를 뺀 {won(90)}이 환불됩니다.
              </li>
            </>
          ) : (
            <li>· 촬영 8일 전까지는 전액, 4~7일 전은 60%, 3일 전부터 촬영 당일까지는 10%가 환불됩니다.</li>
          )}
          <li>· 취소 없이 촬영에 오지 않으시면 환불되지 않습니다.</li>
          <li>· 촬영일까지 7일 이하로 남은 뒤에는 결제 7일 이내여도 청약철회가 제한됩니다.</li>
        </ul>
      )}

      {/* 위약금 표 — 정책 12조 1호. 날짜 문장과 별도로 표 자체도 보여준다 */}
      <table className="mt-2 w-full text-caption tabular-nums text-muted">
        <tbody>
          {PENALTY_BANDS.map((b) => (
            <tr key={b.minDays} className="border-t border-line/60">
              <td className="py-1 pr-2">
                {b.minDays >= 8 ? "촬영 8일 이상 전" : b.minDays >= 4 ? "촬영 4~7일 전" : "3일 전 ~ 촬영 당일"}
              </td>
              <td className="py-1 text-right">위약금 {b.penaltyPct}%</td>
              <td className="py-1 pl-2 text-right text-fg">환불 {100 - b.penaltyPct}%</td>
            </tr>
          ))}
          <tr className="border-t border-line/60">
            <td className="py-1 pr-2">취소 없이 불참</td>
            <td className="py-1 text-right">위약금 100%</td>
            <td className="py-1 pl-2 text-right text-fg">환불 0%</td>
          </tr>
        </tbody>
      </table>

      <ul className="mt-2 flex list-none flex-col gap-1 text-caption leading-relaxed text-muted">
        <li>· 작가 사정으로 촬영이 무산되면 전액 환불됩니다.</li>
        <li>
          · 사매는 통신판매중개자이고, 촬영 계약의 당사자는 작가님입니다. 환불 여부와 금액은 사매가 이 기준으로 판정해 직접 돌려드려요.
        </li>
        <li>
          · <b className="text-fg">작가 개인 계좌로의 직접 송금은 보호받을 수 없어요.</b> 반드시 사매 계좌로 보내주세요.
        </li>
      </ul>
    </div>
  );
}

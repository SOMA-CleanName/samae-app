import { redirect } from "next/navigation";

/*
  환불 신청 화면 — **폐지됨. 예약 상세로 돌려보낸다.**

  여기 있던 화면은 리드 모델(작가가 촬영비를 자기 계좌로 직접 받던 때) 것이었다.
  이렇게 안내하고 있었다 —

    "우리 플랫폼은 결제를 중개하지 않아요. 촬영비는 작가 계좌로 직접 송금되었으므로,
     환불 금액도 작가가 직접 고객 계좌로 송금합니다. 계좌 정보는 채팅으로 전달해주세요."

  2026-08 구조개편으로 사매가 대금을 보관하고 환불도 사매가 판정하게 되면서
  세 가지가 한꺼번에 어긋났다.

    1. /trust 는 "사매 계좌로 받습니다 · 판단은 사매가 합니다" 라고 약속한다 — 정반대다
    2. 고객이 버튼 하나로 예약을 refunded 로 전이시키고 수수료까지 면제됐다. 판정 없이
    3. "계좌 정보는 채팅으로" 라고 시키지만 moderation.ts 가 계좌를 차단한다 — 막다른 길

  지금 창구는 [사매에 문의](SupportButton) 하나다. 구간별 금액은 refundQuote 가 계산하고
  처리는 어드민 거래 관리(adminRefund)가 한다. 이 파일은 북마크·외부 링크를 흡수하는
  용도로만 남는다 — 지워도 무방하다.
*/

export default async function RefundPageRemoved({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/bookings/${id}`);
}

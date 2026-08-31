import { redirect } from "next/navigation";

// 레거시 송금 안내 — 작가 개인 계좌를 노출하던 에스크로 우회 경로였다.
// 입금 안내는 예약 상세(사매 계좌)와 채팅 카드로 일원화됐으므로 상세로 넘긴다.
export default async function TransferGuidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/bookings/${id}`);
}

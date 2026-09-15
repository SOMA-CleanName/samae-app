import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMySettlements } from "@/lib/payments";
import { ackSettlement, disputeSettlement } from "@/app/actions/payments";
import { SettlementsBody } from "@/components/settlement/SettlementsBody";

/*
  작가 정산 내역 — 사매 계좌 에스크로 기준.

  ⚠️ 이 화면은 2026-09 에 통째로 다시 썼다. 이전 버전은 **리드(문의 해제) 모델**이었다 —
  작가가 리드마다 건당 수수료를 사매에 내던 구조라 "입금 대기 / 납부 완료" 를 보여줬고,
  주석에도 *"사용자→작가 촬영비는 오프플랫폼이라 플랫폼이 보관/정산하지 않는다"* 고 적혀
  있었다. 지금은 **돈의 방향이 반대다.** 고객이 사매에 내고, 사매가 수수료를 뗀 뒤
  작가에게 보낸다.

  이 화면으로 오는 경로는 두 개다.
    · 알림톡 「정산 완료」 버튼 → samae.ai/studio/settlements (notify-templates.ts)
    · 정산 관련 인앱 알림 링크 (notify-user.ts)

  그래서 여기서 답해야 하는 질문은 하나다 — **내 돈이 지금 어디까지 왔나.**
  금액을 바꾸는 조작(수령 확인 등)은 채팅방 예약 카드에서 한다. 여기는 읽기 전용이다.

  지면 자체는 components/settlement/SettlementsBody 에 있다. 샌드박스(/dev/money)가
  같은 화면을 그려야 해서 떼어냈다 — 마크업을 베끼면 실제와 다른 걸 QA 하게 된다.
*/

export default async function SettlementsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/settlements");
  if (!me.photographer) redirect("/studio");

  const rows = await listMySettlements(me.photographer.id);
  return <SettlementsBody rows={rows} actions={{ ack: ackSettlement, dispute: disputeSettlement }} />;
}

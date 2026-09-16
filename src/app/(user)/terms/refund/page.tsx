import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, P } from "@/components/legal/LegalDoc";
import { RefundPolicyBody } from "@/components/legal/docs/RefundPolicyBody";
import { POLICY_EFFECTIVE_DATE, REFUND_POLICY_VERSION } from "@/lib/policy-version";

/*
  취소·환불 정책 — 본문.

  진실은 정책 문서(취소환불정책 1.0)이고 판정 코드는 lib/refund.ts 다. 여기서 조문을 고치지 말 것.
  위약금 표는 refund.ts 의 PENALTY_BANDS 에서 읽어 지면과 계산이 어긋날 수 없게 한다.
*/

export const metadata: Metadata = {
  title: "취소·환불 정책",
  description: "사매 촬영 예약의 취소·환불 기준과 절차. 촬영일까지 남은 기간에 따른 위약금과 청약철회.",
  alternates: { canonical: "/terms/refund" },
};


export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="사매 취소·환불 정책"
      effectiveDate={POLICY_EFFECTIVE_DATE}
      version={REFUND_POLICY_VERSION}
      lead={
        <P>
          이 정책은 사매 회원 이용약관 및 사매 작가 이용약관의 일부를 구성하며, 서비스를 통해 성립한
          촬영 계약의 취소·환불 기준과 그 처리 절차를 정합니다. 이 정책에서 정하지 않은 용어는 각
          약관의 정의에 따릅니다.
        </P>
      }
      footer={
        <>
          지금 예약을 취소하면 얼마가 돌아오는지는 예약 카드의 [사매에 문의] 에서 바로 볼 수 있습니다.
          기준이 실제로 어떻게 적용되는지는{" "}
          <Link href="/trust" className="underline underline-offset-2">
            안전하게 촬영하기
          </Link>
          에 적어 두었습니다.
        </>
      }
    >
      <RefundPolicyBody />
    </LegalPage>
  );
}

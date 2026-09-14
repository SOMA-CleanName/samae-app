import type { Metadata } from "next";
import { LegalPage, P } from "@/components/legal/LegalDoc";
import { FeePolicyBody } from "@/components/legal/docs/FeePolicyBody";
import { FEE_POLICY_VERSION, POLICY_EFFECTIVE_DATE } from "@/lib/policy-version";

/*
  수수료·정산 정책 — 본문.

  진실은 정책 문서(수수료정산정책 1.0)이고 계산은 lib/platform-fee.ts 다. 요율은 상수에서 읽어
  지면과 계산이 어긋날 수 없게 한다. 정산 주기의 구체적 날짜는 정책팀이 정하면 채운다 (docs/35 6장 1번).
*/

export const metadata: Metadata = {
  title: "수수료·정산 정책",
  description: "사매 중개 수수료율과 작가 정산의 시기·방법·공제·세무 처리.",
  alternates: { canonical: "/terms/fees" },
};


export default function FeePolicyPage() {
  return (
    <LegalPage
      title="사매 수수료·정산 정책"
      effectiveDate={POLICY_EFFECTIVE_DATE}
      version={FEE_POLICY_VERSION}
      lead={
        <P>
          이 정책은 사매 작가 이용약관 및 사매 작가 입점 계약의 일부를 구성하며, 중개 수수료와 정산에 관한
          사항을 정합니다. 이 정책에서 정하지 않은 용어는 사매 작가 이용약관의 정의에 따릅니다.
        </P>
      }
    >
      <FeePolicyBody />
    </LegalPage>
  );
}

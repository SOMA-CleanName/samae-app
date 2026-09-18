import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalDoc";
import { PhotographerTermsBody } from "@/components/legal/docs/PhotographerTermsBody";
import { PHOTOGRAPHER_TERMS_VERSION, POLICY_EFFECTIVE_DATE } from "@/lib/policy-version";

/*
  작가 이용약관 — 본문. 진실은 정책 문서(작가이용약관 1.0). 여기서 조문을 고치지 말 것.
  작가는 입점 동의 화면(AgreeGate)에서 이 약관과 취소환불정책·입점동의서 셋에 함께 동의한다.

  ⚠️ 2026-09-15 묶음에서 **수수료·정산 정책이 이 약관으로 들어왔다** — 제12조(중개 수수료) ~
     제16조(위약금의 배분). `/terms/fees` 는 이 지면으로 넘어온다.
*/

export const metadata: Metadata = {
  title: "작가 이용약관",
  description:
    "사매에서 촬영 용역을 제공하는 작가와 회사의 권리·의무. 등록, 상품, 이행 의무, 중개 수수료와 정산, 금지 행위, 이용 제한.",
  alternates: { canonical: "/terms/photographer" },
};

export default function PhotographerTermsPage() {
  return (
    <LegalPage
      title="사매 작가 이용약관"
      effectiveDate={POLICY_EFFECTIVE_DATE}
      version={PHOTOGRAPHER_TERMS_VERSION}
      footer={
        <>
          이 약관과 함께 적용되는 문서:{" "}
          <Link href="/terms/refund" className="underline underline-offset-2">취소·환불 정책</Link>,{" "}
          <Link href="/terms/photographer-contract" className="underline underline-offset-2">작가 입점 동의서</Link>.
        </>
      }
    >
      <PhotographerTermsBody />
    </LegalPage>
  );
}

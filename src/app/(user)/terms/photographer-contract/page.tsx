import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, P } from "@/components/legal/LegalDoc";
import { PhotographerContractBody } from "@/components/legal/docs/PhotographerContractBody";
import { PHOTOGRAPHER_CONTRACT_VERSION, POLICY_EFFECTIVE_DATE } from "@/lib/policy-version";

/*
  작가 입점 계약 — 본문. 진실은 정책 문서(작가입점계약 2.0).

  계약은 작가가 입점 동의 화면(/studio/agree)에서 내용을 확인하고 동의한 때 체결되며, 동의일이 계약일이다.
  작가 정보란(성명·사업자 유형·정산 계좌 등)과 홍보 사용 동의 체크는 그 화면에서 받는다 — 여기는 본문만.
*/

export const metadata: Metadata = {
  title: "작가 입점 계약",
  description: "사매에 입점하는 작가와 회사 사이의 개별 계약. 수수료 동의, 외부 거래 금지, 홍보 사용, 비밀유지, 계약 종료.",
  alternates: { canonical: "/terms/photographer-contract" },
};

export default function PhotographerContractPage() {
  return (
    <LegalPage
      title="사매 작가 입점 계약"
      effectiveDate={POLICY_EFFECTIVE_DATE}
      version={PHOTOGRAPHER_CONTRACT_VERSION}
      lead={
        <P>
          사매(이하 &ldquo;회사&rdquo;)와 작가는 회사가 운영하는 사진 촬영 중개 서비스 &ldquo;사매&rdquo;(이하
          &ldquo;서비스&rdquo;)에 작가가 입점하여 활동하는 것에 관하여 다음과 같이 계약을 체결합니다. 이 계약은
          회사의 입점 제안에 따라 작가가 서비스 내 입점 동의 화면에서 계약 내용을 확인하고 동의한 때에 체결되며,
          동의일을 계약일로 합니다.
        </P>
      }
      footer={
        <>
          회사의 상호·대표자·사업자등록번호·주소·연락처는 서비스 화면의 사업자 정보 표시에 따릅니다. 작가는 이 계약과{" "}
          <Link href="/terms/photographer" className="underline underline-offset-2">작가 이용약관</Link>,{" "}
          <Link href="/terms/fees" className="underline underline-offset-2">수수료·정산 정책</Link>,{" "}
          <Link href="/terms/refund" className="underline underline-offset-2">취소·환불 정책</Link>을 모두 확인하였으며,
          서비스 내 입점 동의 화면에서 동의함으로써 이 계약을 체결합니다. 회사는 동의 일시와 계정 정보를 보관합니다.
        </>
      }
    >
      <PhotographerContractBody />
    </LegalPage>
  );
}

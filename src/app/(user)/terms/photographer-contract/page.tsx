import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalDoc";
import { PhotographerContractBody } from "@/components/legal/docs/PhotographerContractBody";
import { PHOTOGRAPHER_CONTRACT_VERSION, POLICY_EFFECTIVE_DATE } from "@/lib/policy-version";

/*
  작가 입점 동의서 — 본문. 진실은 정책 문서(작가입점동의서 1.0).

  이용계약은 작가가 입점 동의 화면(AgreeGate)에서 정보를 입력하고 동의한 때 성립하며, 동의일이 계약일이다.
  작가 정보란(성명·사업자 유형·정산 계좌)은 그 화면이 실제로 받는다 — 여기는 무엇을 받는지 적은 본문만.

  ⚠️ 주소는 `/terms/photographer-contract` 그대로 둔다. 문서 이름이 "입점 계약" 에서 "입점 동의서" 로
     바뀌었지만, 이 주소는 약관 목록·설정·개인정보 처리방침에 걸려 있고 sitemap 에도 올라가 있다.
     이름을 따라 주소까지 옮기면 밖에서 들어온 링크가 전부 끊긴다.

  ⚠️ 형제 지면과 달리 `lead` 를 두지 않는다 — 본문 첫 문단이 이미 "동의한 때에 계약이 성립한다" 를
     말한다. 둘 다 두면 같은 문장이 연달아 두 번 나온다.

  ⚠️ **요율을 넘기지 않는다** — 누가 읽는지 모르는 공개 지면이라 전역 기본값이 나온다.
     그 작가의 실제 요율은 스튜디오 동의 화면이 feeRate 를 넘겨 보여준다.
*/

export const metadata: Metadata = {
  title: "작가 입점 동의서",
  description:
    "사매에 입점하는 작가가 동의 화면에서 입력·선택하는 내용. 작가 정보, 중개 수수료, 홍보 사용, 권리 보증, 통지 수단.",
  alternates: { canonical: "/terms/photographer-contract" },
};

export default function PhotographerContractPage() {
  return (
    <LegalPage
      title="사매 작가 입점 동의서"
      effectiveDate={POLICY_EFFECTIVE_DATE}
      version={PHOTOGRAPHER_CONTRACT_VERSION}
      footer={
        <>
          회사의 상호·대표자·사업자등록번호·주소·연락처는 서비스 화면의 사업자 정보 표시에 따릅니다. 작가는 이
          동의서와{" "}
          <Link href="/terms/photographer" className="underline underline-offset-2">작가 이용약관</Link>,{" "}
          <Link href="/terms/refund" className="underline underline-offset-2">취소·환불 정책</Link>을 모두
          확인하였으며, 서비스 내 입점 동의 화면에서 동의함으로써 이용계약을 체결합니다. 회사는 동의 일시와
          동의한 문서의 버전을 보관합니다.
        </>
      }
    >
      <PhotographerContractBody />
    </LegalPage>
  );
}

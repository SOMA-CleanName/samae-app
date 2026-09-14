import type { ReactNode } from "react";
import { FeePolicyBody } from "./docs/FeePolicyBody";
import { PhotographerContractBody } from "./docs/PhotographerContractBody";
import { PhotographerTermsBody } from "./docs/PhotographerTermsBody";
import { RefundPolicyBody } from "./docs/RefundPolicyBody";
import {
  FEE_POLICY_VERSION,
  PHOTOGRAPHER_CONTRACT_VERSION,
  PHOTOGRAPHER_TERMS_VERSION,
  REFUND_POLICY_VERSION,
} from "@/lib/policy-version";

// 작가가 입점 전에 동의해야 하는 문서 넷 — **한 곳에서 정의한다.**
//
// 동의 화면·공개 지면·동의 기록이 전부 이 목록을 본다. 따로 적어 두면 문서가 늘거나
// 버전이 오를 때 한쪽만 바뀌고, 그러면 "동의는 받았는데 무엇에 동의했는지" 가 흔들린다.

export type DocKey = "contract" | "terms" | "fee" | "refund";

export type PhotographerDoc = {
  key: DocKey;
  label: string;
  /** 공개 지면 주소 — 동의 화면 밖에서 다시 읽고 싶을 때 */
  href: string;
  version: string;
  /** 한 줄 요약 — 목록에서 무엇을 읽는지 알 수 있게 */
  summary: string;
  body: ReactNode;
};

export const PHOTOGRAPHER_DOCS: PhotographerDoc[] = [
  {
    key: "contract",
    label: "작가 입점 계약",
    href: "/terms/photographer-contract",
    version: PHOTOGRAPHER_CONTRACT_VERSION,
    summary: "계약 당사자·기간·해지, 홍보 사용 동의",
    body: <PhotographerContractBody />,
  },
  {
    key: "terms",
    label: "작가 이용약관",
    href: "/terms/photographer",
    version: PHOTOGRAPHER_TERMS_VERSION,
    summary: "활동 자격·의무, 오프플랫폼 금지, 고객 연락처 취급",
    body: <PhotographerTermsBody />,
  },
  {
    key: "fee",
    label: "수수료·정산 정책",
    href: "/terms/fees",
    version: FEE_POLICY_VERSION,
    summary: "중개 수수료율과 부가세, 정산 시기·방법·공제",
    body: <FeePolicyBody />,
  },
  {
    key: "refund",
    label: "취소·환불 정책",
    href: "/terms/refund",
    version: REFUND_POLICY_VERSION,
    summary: "취소 시점별 위약금 구간, 작가 귀책 취소의 책임",
    body: <RefundPolicyBody />,
  },
];

export const DOC_ORDER: DocKey[] = PHOTOGRAPHER_DOCS.map((d) => d.key);

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

/**
 * 작가가 동의해야 하는 문서 넷.
 *
 * ⚠️ 함수인 이유 — **수수료 요율이 작가마다 다르다.** 상수로 두면 전역 기본값이 박히고,
 *    개별 요율을 받은 작가가 "20% 라고 적혀 있는데 내 정산은 다르다" 를 겪는다
 *    (2026-09-17 신고). 요율을 안 넘기면 기본값이라 공개 지면은 그대로 쓸 수 있다.
 *
 * ⚠️ 요율이 박히는 곳은 **둘**이다 — 수수료 정책 제1조와 입점 계약 제5조 2항. 처음엔
 *    수수료 정책만 고쳐서, 같은 화면 안에서 두 문서가 다른 숫자를 보여줬다. 계약 제2조
 *    2항이 "충돌하면 이 계약이 먼저" 라 하필 틀린 쪽이 이기는 문안이었다.
 */
export function photographerDocs(opts?: { feeRate?: number | null }): PhotographerDoc[] {
  return [
  {
    key: "contract",
    label: "작가 입점 계약",
    href: "/terms/photographer-contract",
    version: PHOTOGRAPHER_CONTRACT_VERSION,
    summary: "계약 당사자·기간·해지, 홍보 사용 동의",
    // 요율이 제5조 2항에 박힌다 — 수수료 정책과 같은 값을 보여줘야 한다
    body: <PhotographerContractBody rate={opts?.feeRate} />,
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
    body: <FeePolicyBody rate={opts?.feeRate} />,
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
}

/** 요율과 무관한 곳(순서·개수)에서 쓰는 기본 목록 */
export const PHOTOGRAPHER_DOCS: PhotographerDoc[] = photographerDocs();

export const DOC_ORDER: DocKey[] = PHOTOGRAPHER_DOCS.map((d) => d.key);

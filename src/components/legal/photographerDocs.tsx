import type { ReactNode } from "react";
import { PhotographerContractBody } from "./docs/PhotographerContractBody";
import { PhotographerTermsBody } from "./docs/PhotographerTermsBody";
import { RefundPolicyBody } from "./docs/RefundPolicyBody";
import {
  PHOTOGRAPHER_CONTRACT_VERSION,
  PHOTOGRAPHER_TERMS_VERSION,
  REFUND_POLICY_VERSION,
} from "@/lib/policy-version";

// 작가가 입점 전에 동의해야 하는 문서 셋 — **한 곳에서 정의한다.**
//
// 동의 화면·공개 지면·동의 기록이 전부 이 목록을 본다. 따로 적어 두면 문서가 늘거나
// 버전이 오를 때 한쪽만 바뀌고, 그러면 "동의는 받았는데 무엇에 동의했는지" 가 흔들린다.
//
// ⚠️ 2026-09-15 묶음에서 **넷에서 셋으로 줄었다.** 수수료·정산 정책이 폐지되고 그 내용이
//    작가 이용약관 제12조~제16조와 입점 동의서 제3항으로 들어갔다. 개수를 세는 문구
//    ("문서 4종…")가 남아 있으면 같이 고칠 것 — DOC_ORDER 를 세는 쪽은 저절로 따라온다.

export type DocKey = "contract" | "terms" | "refund";

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
 * 작가가 동의해야 하는 문서 셋.
 *
 * ⚠️ 함수인 이유 — **수수료 요율이 작가마다 다르다.** 상수로 두면 전역 기본값이 박히고,
 *    개별 요율을 받은 작가가 "20% 라고 적혀 있는데 내 정산은 다르다" 를 겪는다
 *    (2026-09-17 신고). 요율을 안 넘기면 기본값이라 공개 지면은 그대로 쓸 수 있다.
 *
 * ⚠️ 요율이 박히는 곳은 이제 **입점 동의서 제3항 하나**다. 작가 이용약관 제12조 1항이
 *    "입점 동의서에 기재된 요율에 따른다" 로 넘기기 때문. 전에는 수수료 정책과 입점 계약
 *    두 곳에 숫자가 있어서 같은 화면에서 서로 다른 값을 보여준 적이 있다.
 */
export function photographerDocs(opts?: { feeRate?: number | null }): PhotographerDoc[] {
  return [
    {
      key: "contract",
      label: "작가 입점 동의서",
      href: "/terms/photographer-contract",
      version: PHOTOGRAPHER_CONTRACT_VERSION,
      summary: "작가 정보·중개 수수료·홍보 사용·권리 보증",
      // 요율이 제3항에 박힌다 — 이 작가에게 실제로 적용되는 값이어야 한다
      body: <PhotographerContractBody rate={opts?.feeRate} />,
    },
    {
      key: "terms",
      label: "작가 이용약관",
      href: "/terms/photographer",
      version: PHOTOGRAPHER_TERMS_VERSION,
      summary: "이행 의무, 수수료·정산, 오프플랫폼 금지, 제재",
      body: <PhotographerTermsBody />,
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

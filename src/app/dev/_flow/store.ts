"use client";

// 작가 온보딩 샌드박스의 저장소 — **전부 localStorage.** 네트워크로 나가는 게 하나도 없다.
//
// 왜 이게 필요한가. 로컬이 운영 Supabase 를 그대로 쓴다(별도 dev 프로젝트가 없다).
// 그래서 흐름을 한 번 돌 때마다 진짜 행이 쌓이고, 그보다 나쁜 건 **밖으로 나가는 것들**이다 —
// 디스코드 신청 알림이 팀 채널에 울리고, Mixpanel 에 이벤트가 박히고(dev 게이트가 없다),
// 솔라피가 문자를 쏜다(NOTIFY_SMS_DEV=on). QA 를 스무 번 돌면 스무 번 다 그런다.
//
// 여기는 그 전부를 끊는다. 화면과 검증 로직은 실제 컴포넌트를 그대로 쓰고,
// 저장만 이 파일로 돌린다.

export type FlowStage =
  | "intro"    // /apply 안내 (비로그인)
  | "signup"   // 카카오 가입 — 실제 카카오는 샌드박스가 못 태운다. 버튼만 같고 통과시킨다
  | "consent"  // 약관 동의 (/signup/consent)
  | "contact"  // 연락처 등록 (/signup/contact)
  | "form"     // 신청 폼 (/apply)
  | "pending"  // 승인 대기
  | "agree"    // 입점 동의 (/studio)
  | "done";

export type FlowState = {
  stage: FlowStage;
  application: {
    displayName: string;
    portfolioUrl: string;
    phone: string;
    bio: string;
    submittedAt: string;
  } | null;
  signup: { agreedTerms: boolean; agreedPrivacy: boolean; phone: string; at: string } | null;
  agreement: {
    versions: Record<string, string>;
    legalName: string;
    businessType: string;
    businessNo: string;
    promoConsent: boolean;
    agreedAt: string;
    docRecords?: Record<string, { openedAt?: string; agreedAt?: string }>;
  } | null;
};

const KEY = "samae:dev-flow";

export const EMPTY: FlowState = {
  stage: "intro",
  signup: null,
  application: null,
  agreement: null,
};

export function readFlow(): FlowState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<FlowState>) };
  } catch {
    return EMPTY;
  }
}

export function writeFlow(next: FlowState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 시크릿 창에서 용량 제한에 걸리는 정도 — 샌드박스가 죽을 이유는 아니다
  }
  window.dispatchEvent(new Event("samae:dev-flow"));
}

export function resetFlow(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* 위와 같다 */
  }
  window.dispatchEvent(new Event("samae:dev-flow"));
}

export function setStage(stage: FlowStage): void {
  writeFlow({ ...readFlow(), stage });
}

/**
 * 단계마다 **사는 라우트가 다르다.**
 *
 * 실제 지면들이 서로 다른 레이아웃에 속해 있기 때문이다 —
 *   · 안내·신청폼·승인대기  `(user)` 레이아웃 (하단 내비 + main pb-28)
 *   · 가입·약관·연락처      `(auth)` — 레이아웃 없음(루트만)
 *   · 입점 동의             studio/layout 이 동의 전이면 AgreeGate 만 그린다 → 루트와 같음
 *
 * 한 라우트에 몰아넣으면 셋 중 둘은 실제와 다른 껍데기를 쓰게 된다. 그래서 갈랐다.
 * URL 은 달라지지만 **화면은 실제와 같아진다** — 우리가 맞춰야 하는 건 화면 쪽이다.
 */
const USER_STAGES: FlowStage[] = ["intro", "form", "pending", "done"];

export function stagePath(stage: FlowStage): string {
  const base = USER_STAGES.includes(stage) ? "/dev/flow" : "/dev/flow-auth";
  return `${base}?stage=${stage}&next=%2Fapply`;
}

"use client";

import mixpanel from "mixpanel-browser";

// Mixpanel 클라이언트 래퍼 (프로덕트 애널리틱스 — 퍼널·리텐션·코호트).
// - 토큰(NEXT_PUBLIC_MIXPANEL_TOKEN) 없으면 전부 no-op (프리뷰/로컬 안전).
// - 최초 사용 시 지연 init (idempotent). 자동수집은 끄고 이벤트를 직접 정의한다.
// - PII(이름·이메일·전화)는 전송하지 않는다.

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
let ready = false;

function ensure(): boolean {
  if (ready) return true;
  if (typeof window === "undefined" || !TOKEN) return false;
  try {
    mixpanel.init(TOKEN, {
      persistence: "localStorage",
      // EU 데이터 레지던시가 필요하면 아래 주석 해제:
      // api_host: "https://api-eu.mixpanel.com",
      // 오토캡처: 페이지뷰·클릭·스크롤·폼제출을 자동 수집(폭넓은 탐색용).
      // 커스텀 이벤트(핵심 퍼널)와 병행. PII 안전 설정:
      //  · input=false → 입력 상호작용 미수집(계좌·이름 등 폼 보호)
      //  · capture_text_content=false → 요소 텍스트(계좌번호 등) 미수집
      autocapture: {
        pageview: "full-url",
        click: true,
        scroll: true,
        submit: true,
        input: false,
        capture_text_content: false,
      },
    });
    ready = true;
  } catch {
    /* 무시 — 분석 실패가 UX 를 막지 않게 */
  }
  return ready;
}

export function mpEnabled(): boolean {
  return !!TOKEN;
}

export function mpTrack(event: string, props?: Record<string, unknown>): void {
  if (!ensure()) return;
  try {
    mixpanel.track(event, props);
  } catch {
    /* 무시 */
  }
}

/** UTM·랜딩경로 등 세션 공통 속성 등록(이후 모든 이벤트에 자동 첨부). */
export function mpRegister(props: Record<string, unknown>): void {
  if (!ensure()) return;
  try {
    mixpanel.register(props);
  } catch {
    /* 무시 */
  }
}

export function mpIdentify(id: string, props?: Record<string, unknown>): void {
  if (!ensure()) return;
  try {
    mixpanel.identify(id);
    if (props) mixpanel.people.set(props);
  } catch {
    /* 무시 */
  }
}

/** 유저 프로필 속성 갱신(people.set) — role·작가상태 등 최신값. */
export function mpPeople(props: Record<string, unknown>): void {
  if (!ensure()) return;
  try {
    mixpanel.people.set(props);
  } catch {
    /* 무시 */
  }
}

/** 최초값만 기록(people.set_once) — first-touch UTM 등 유입 원인 보존. */
export function mpPeopleOnce(props: Record<string, unknown>): void {
  if (!ensure()) return;
  try {
    mixpanel.people.set_once(props);
  } catch {
    /* 무시 */
  }
}

/** 로그아웃 — 익명 distinct_id 로 초기화(유저 혼입 방지). */
export function mpReset(): void {
  if (!ready || !TOKEN) return;
  try {
    mixpanel.reset();
  } catch {
    /* 무시 */
  }
}

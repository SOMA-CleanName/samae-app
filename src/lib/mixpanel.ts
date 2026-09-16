"use client";

import { isKoreaVisitor } from "@/lib/replay-gate";

// Mixpanel 클라이언트 래퍼 (프로덕트 애널리틱스 — 퍼널·리텐션·코호트).
// - 토큰(NEXT_PUBLIC_MIXPANEL_TOKEN) 없으면 전부 no-op (프리뷰/로컬 안전).
// - 자동수집은 끄고 이벤트를 직접 정의한다.
// - PII(이름·이메일·전화)는 전송하지 않는다.
//
// ⚠️ **SDK 를 정적으로 import 하지 않는다.**
//    `import mixpanel from "mixpanel-browser"` 한 줄이 초기 번들에 **416KB(압축 전)** 를
//    얹었다. 세션 리플레이(rrweb)가 통째로 딸려 오기 때문이다. 그게 모든 지면에 실려서
//    페이지를 옮길 때마다 느렸다(2026-09-16 신고: "요소 로딩이 엄청 오래걸린다").
//
//    분석은 **화면이 그려진 뒤에 도착해도 되는 일**이다. 첫 호출 때 동적으로 불러오고,
//    불러오는 동안 들어온 호출은 큐에 쌓았다가 그대로 흘려보낸다 — 이벤트는 유실되지 않는다.

type MP = typeof import("mixpanel-browser").default;

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
let mp: MP | null = null;
let loading = false;
/** 로드 전에 들어온 호출 — 순서대로 다시 흘려보낸다 */
const pending: ((m: MP) => void)[] = [];

/** 이 브라우저에서 수집해도 되는가 */
function allowed(): boolean {
  if (typeof window === "undefined" || !TOKEN) return false;
  // 개발·프리뷰 호스트 가드 — .env.local 에 토큰이 있어도 localhost/Vercel 프리뷰
  // 트래픽이 프로덕션 지표에 섞이지 않게 한다. (2026-08 스캔에서 localhost 이벤트
  // 2,900여 개가 프로덕션 Mixpanel 에 유입된 것 확인)
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1" && !host.endsWith(".vercel.app");
}

function load(): void {
  if (loading || mp || !allowed()) return;
  loading = true;
  import("mixpanel-browser")
    .then(({ default: m }) => {
      m.init(TOKEN!, {
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
        // 세션 리플레이 — 한국 방문자만 녹화(해외 스토리 유입은 쿼터 절약 위해 제외).
        // PII 보호: .mp-mask(연락처 입력)만 가리고 사진·텍스트는 흐름 파악 위해 노출.
        record_sessions_percent: isKoreaVisitor() ? 100 : 0,
        record_mask_text_selector: ".mp-mask",
        record_block_selector: ".mp-block",
      });
      mp = m;
      for (const fn of pending.splice(0)) {
        try {
          fn(m);
        } catch {
          /* 무시 — 분석 실패가 UX 를 막지 않게 */
        }
      }
    })
    .catch(() => {
      // 못 불러오면 조용히 포기한다. 쌓인 큐는 버린다 — 무한정 들고 있을 이유가 없다.
      pending.length = 0;
      loading = false;
    });
}

/** SDK 가 준비됐으면 지금, 아니면 준비된 뒤에 실행 */
function run(fn: (m: MP) => void): void {
  if (mp) {
    try {
      fn(mp);
    } catch {
      /* 무시 */
    }
    return;
  }
  if (!allowed()) return;
  pending.push(fn);
  load();
}

export function mpEnabled(): boolean {
  return !!TOKEN;
}

export function mpTrack(event: string, props?: Record<string, unknown>): void {
  run((m) => m.track(event, props));
}

/**
 * 페이지 이탈 직전용 전송 — sendBeacon 으로 즉시 발화(언로드 중 XHR 은 유실됨).
 * '이탈 시점' 이벤트(예: Inquiry Abandoned)처럼 마지막 순간에 남겨야 하는 것에만 쓴다.
 */
export function mpTrackBeacon(event: string, props?: Record<string, unknown>): void {
  run((m) => m.track(event, props, { transport: "sendBeacon" }));
}

/** UTM·랜딩경로 등 세션 공통 속성 등록(이후 모든 이벤트에 자동 첨부). */
export function mpRegister(props: Record<string, unknown>): void {
  run((m) => m.register(props));
}

export function mpIdentify(id: string, props?: Record<string, unknown>): void {
  run((m) => {
    m.identify(id);
    if (props) m.people.set(props);
  });
}

/** 유저 프로필 속성 갱신(people.set) — role·작가상태 등 최신값. */
export function mpPeople(props: Record<string, unknown>): void {
  run((m) => m.people.set(props));
}

/** 최초값만 기록(people.set_once) — first-touch UTM 등 유입 원인 보존. */
export function mpPeopleOnce(props: Record<string, unknown>): void {
  run((m) => m.people.set_once(props));
}

/** 현재 distinct_id (익명이면 "$device:xxx"). 읽기 쉬운 라벨 생성용. */
export function mpDistinctId(): string {
  // 동기 함수라 기다릴 수 없다 — 아직 안 왔으면 빈 문자열이다. 호출부(MixpanelTracker)는
  // 라벨용이라 "0000" 으로 떨어지고, 다음 렌더에는 제대로 나온다.
  if (!mp) {
    load();
    return "";
  }
  try {
    return mp.get_distinct_id() || "";
  } catch {
    return "";
  }
}

/** 스태프(운영자·작가) 추적 중단 — 이후 이벤트 미전송(브라우저에 영속). 퍼널·플로우 오염 방지. */
export function mpOptOut(): void {
  run((m) => m.opt_out_tracking());
}

/** 추적 재개 — 이전에 스태프로 옵트아웃됐던 브라우저를 일반 유저로 되돌릴 때만. */
export function mpOptIn(): void {
  run((m) => {
    if (m.has_opted_out_tracking?.()) m.opt_in_tracking();
  });
}

/** 로그아웃 — 익명 distinct_id 로 초기화(유저 혼입 방지). */
export function mpReset(): void {
  // 아직 안 불러왔으면 초기화할 상태도 없다 — 굳이 불러오지 않는다
  if (!mp) return;
  try {
    mp.reset();
  } catch {
    /* 무시 */
  }
}

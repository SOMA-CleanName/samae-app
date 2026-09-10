// 외부 채널 알림 템플릿 레지스트리 — 카카오 알림톡(1순위) · 문자(대체).
//
// 이 파일의 본문이 곧 솔라피 콘솔에 등록해 심사받는 알림톡 템플릿 원문이다.
// (등록 절차·버튼 설정은 docs/34-kakao-alimtalk.md). 여기 문안을 바꾸면 템플릿을 다시 심사받아야 하고,
// 심사가 끝나기 전까지는 카카오 쪽 본문(구버전)과 문자 대체 본문(신버전)이 어긋난다.
// 그래서 문안은 함부로 손대지 말고, 바꿀 땐 템플릿 재등록 → env 의 템플릿 ID 교체까지 한 세트로.
//
// 변수는 `#{이름}` 꼴 — 카카오 규격. 값은 전부 문자열이어야 한다.
// PII 는 이름·촬영일·금액 정도만. 연락처·계좌번호는 절대 변수로 넣지 않는다.
//
// 이 모듈은 server-only 가 아니다 — 순수 함수라 단위 테스트(notify-templates.test.ts)로 검증한다.

export type NotifyKind =
  | "chat_reply" // 작가 답장 → 고객 (보는 중이면 스킵 · 안 읽은 채로는 24h 쿨다운)
  | "chat_message_to_photographer" // 고객 메시지 → 작가 (억제 정책 적용)
  | "inquiry_received" // 새 문의 첫 발화 → 작가 (대화당 1회)
  | "booking_proposed" // 예약 제안 → 상대방 (예약당 1회)
  | "booking_accepted" // 예약 수락 → 제안자 (예약당 1회)
  | "deposit_confirmed" // 운영 입금 확인 → 고객 (예약당 1회)
  | "booking_confirmed" // 운영 입금 확인 → 작가 (예약당 1회)
  | "settlement_paid"; // 정산 완료 → 작가 (예약당 1회)

export type NotifyTemplate = {
  kind: NotifyKind;
  /** 어드민 발송 이력·콘솔 등록용 이름 */
  label: string;
  recipient: "customer" | "photographer" | "counterparty";
  /** 본문에 등장하는 변수 이름 (`#{}` 제외). 렌더링 시 전부 채워져야 한다 */
  variables: readonly string[];
  /** 알림톡 심사 원문 = 문자 대체 본문 */
  body: string;
  /**
   * 알림톡 버튼 (웹링크).
   *
   * `url` 은 **콘솔에 등록할 값**이다. 본문의 `#{링크}` 를 그대로 쓸 수 없다 —
   * 카카오는 웹링크에 프로토콜이 고정으로 앞에 있기를 요구해서 `#{링크}` 단독은 거부된다.
   * 그래서 도메인까지는 박고 경로만 변수로 뺀다.
   *
   * `urlVariable` 은 그 경로 변수 이름. 본문 변수(`variables`)와 별개이므로 발송할 때
   * notify-user.ts 가 따로 채워 보낸다. 없으면(고정 URL) undefined.
   *
   * 본문에는 `#{링크}` 가 그대로 남아 있어야 한다 — 문자로 대체 발송될 땐 버튼이 없다.
   */
  button: { name: string; url: string; urlVariable?: string };
};

export const NOTIFY_TEMPLATES: Record<NotifyKind, NotifyTemplate> = {
  chat_reply: {
    kind: "chat_reply",
    label: "작가 답장",
    recipient: "customer",
    variables: ["작가명", "링크"],
    body: `[사매] 문의하신 내용에 #{작가명} 작가님이 답장을 보냈어요.
채팅방에서 확인해 주세요.
#{링크}`,
    button: { name: "답장 확인하기", url: "https://samae.ai/chat/#{채팅방ID}", urlVariable: "채팅방ID" },
  },
  // 고객이 상담 중 보낸 메시지 → 작가. chat_reply 의 반대 방향이고 판정 규칙은 같다.
  //
  // ⚠️ **아직 검수 전이다.** ALIMTALK_TPL_CHAT_MESSAGE_TO_PHOTOGRAPHER 가 비어 있으면
  //    dispatchNotify 가 이 body 를 그대로 문자로 보낸다. 승인되면 ID 만 채우면 된다.
  //
  // 문구는 승인된 6종과 같은 "~하신" 패턴이다 — 수신자(작가)가 한 행위를 첫 줄에 박는다.
  // 이걸 벗어난 예약 제안 템플릿 하나가 "수신 대상을 확인하기 어렵다" 로 반려됐었다.
  chat_message_to_photographer: {
    kind: "chat_message_to_photographer",
    label: "고객 메시지",
    recipient: "photographer",
    variables: ["고객명", "링크"],
    body: `[사매] 상담하신 촬영 건에 #{고객명}님이 새 메시지를 보냈어요.
채팅방에서 확인해 주세요.
#{링크}`,
    button: { name: "메시지 확인하기", url: "https://samae.ai/chat/#{채팅방ID}", urlVariable: "채팅방ID" },
  },
  inquiry_received: {
    kind: "inquiry_received",
    label: "새 문의",
    recipient: "photographer",
    variables: ["링크"],
    body: `[사매] 등록하신 스튜디오로 새 문의가 들어왔어요.
안내봇이 먼저 답하고 있어요. 여유 있을 때 채팅방에서 이어받아 주세요.
#{링크}`,
    button: { name: "문의 확인하기", url: "https://samae.ai/chat/#{채팅방ID}", urlVariable: "채팅방ID" },
  },
  booking_proposed: {
    kind: "booking_proposed",
    label: "예약 제안",
    recipient: "counterparty",
    variables: ["상대명", "촬영일", "금액", "링크"],
    // ⚠️ 이 문구는 **반려 후 고친 것**이다 (2026-09-09). 원문은 "상담 중인 촬영 건에…" 였고,
    //    반려 사유가 *"수신 대상을 명확하게 확인하기 어렵다. 사내 관리자 대상 메시지인가?"* 였다.
    //
    //    "상담 중인" 은 상태라 수신자의 **액션**이 아니다. 승인된 6종은 전부 "~하신" 으로
    //    수신자가 한 일을 특정한다(문의하신 / 등록하신 / 제안하신 / 입금하신 / 수락하신 / 예약하신).
    //    그래서 "채팅으로 상담하신" 으로 바꿨다 — 수신자가 서비스 이용자임도 같이 드러난다.
    //
    //    ⚠️ **이 문장은 솔라피에 등록된 템플릿 본문과 글자까지 같아야 한다.** 알림톡 자체는
    //       templateId + 변수만 보내므로 여기 body 가 달라도 발송은 되지만, 이 body 가
    //       **문자 폴백 문구**로 그대로 나간다(renderNotifyBody). 어긋나면 같은 알림이
    //       채널에 따라 다른 문장으로 도착한다.
    //
    //    역할어("작가님")를 못 붙이는 이유: 이 알림은 **양방향**이다. 작가가 제안하면 고객이,
    //    고객이 제안하면 작가가 받는다(actions/bookings.ts:220).
    body: `[사매] 채팅으로 상담하신 촬영 건에 #{상대명}님이 예약을 제안했어요.
· 촬영일: #{촬영일}
· 금액: #{금액}원
채팅방에서 제안 내용을 확인하고 수락 여부를 결정해 주세요.
#{링크}`,
    button: { name: "제안 확인하기", url: "https://samae.ai/bookings/#{예약ID}", urlVariable: "예약ID" },
  },
  booking_accepted: {
    kind: "booking_accepted",
    label: "예약 수락",
    recipient: "counterparty",
    variables: ["상대명", "촬영일", "링크"],
    body: `[사매] 제안하신 예약을 #{상대명}님이 수락했어요.
· 촬영일: #{촬영일}
입금이 확인되면 예약이 확정돼요. 확인되는 대로 다시 알려드릴게요.
#{링크}`,
    button: { name: "예약 확인하기", url: "https://samae.ai/bookings/#{예약ID}", urlVariable: "예약ID" },
  },
  deposit_confirmed: {
    kind: "deposit_confirmed",
    label: "입금 확인 (고객)",
    recipient: "customer",
    variables: ["작가명", "촬영일", "링크"],
    body: `[사매] 입금하신 예약금이 확인되어 예약이 확정됐어요.
· 작가: #{작가명}
· 촬영일: #{촬영일}
작가님이 촬영을 준비해요. 자세한 내용은 예약 페이지에서 확인해 주세요.
#{링크}`,
    button: { name: "예약 확인하기", url: "https://samae.ai/bookings/#{예약ID}", urlVariable: "예약ID" },
  },
  booking_confirmed: {
    kind: "booking_confirmed",
    label: "입금 확인 (작가)",
    recipient: "photographer",
    variables: ["고객명", "촬영일", "정산금액", "링크"],
    body: `[사매] 수락하신 예약의 입금이 확인되어 예약이 확정됐어요.
· 고객: #{고객명}
· 촬영일: #{촬영일}
· 정산 예정: #{정산금액}원 (수수료 차감 후)
#{링크}`,
    button: { name: "정산 내역 보기", url: "https://samae.ai/studio/settlements" },
  },
  settlement_paid: {
    kind: "settlement_paid",
    label: "정산 완료",
    recipient: "photographer",
    variables: ["촬영일", "정산금액", "링크"],
    body: `[사매] 예약하신 촬영 건의 정산이 완료됐어요.
· 촬영일: #{촬영일}
· 송금액: #{정산금액}원 (수수료 차감 후)
받으신 내역을 스튜디오에서 확인해 주세요.
#{링크}`,
    button: { name: "정산 내역 보기", url: "https://samae.ai/studio/settlements" },
  },
};

export const NOTIFY_KINDS = Object.keys(NOTIFY_TEMPLATES) as NotifyKind[];

export function isNotifyKind(v: unknown): v is NotifyKind {
  return typeof v === "string" && v in NOTIFY_TEMPLATES;
}

/** env 키 — ALIMTALK_TPL_CHAT_REPLY 처럼 kind 를 대문자로 */
export function alimtalkTemplateEnvKey(kind: NotifyKind): string {
  return `ALIMTALK_TPL_${kind.toUpperCase()}`;
}

/** 솔라피에 등록된 알림톡 템플릿 ID. 없으면 undefined → 문자로 대체 */
export function alimtalkTemplateId(kind: NotifyKind): string | undefined {
  return process.env[alimtalkTemplateEnvKey(kind)] || undefined;
}

export type NotifyVariables = Record<string, string>;

/** 본문 렌더링 — 문자 대체 발송·감사 로그용. 변수가 하나라도 비면 던진다 (조용히 `#{}` 가 나가면 안 된다) */
export function renderNotifyBody(kind: NotifyKind, vars: NotifyVariables): string {
  const t = NOTIFY_TEMPLATES[kind];
  const missing = t.variables.filter((v) => !vars[v] || !vars[v].trim());
  if (missing.length > 0) {
    throw new Error(`[notify] ${kind} 변수 누락: ${missing.join(", ")}`);
  }
  return t.body.replace(/#\{([^}]+)\}/g, (_, name: string) => vars[name] ?? `#{${name}}`);
}

/** 솔라피 kakaoOptions.variables 규격 — 키를 `#{이름}` 으로 감싼다 */
export function toSolapiVariables(vars: NotifyVariables): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) out[`#{${k}}`] = String(v);
  return out;
}

// ── 변수값 포맷 ──────────────────────────────────────────────

const KRW = new Intl.NumberFormat("ko-KR");

/** 금액 변수 — 본문에 '원' 이 이미 붙어 있으니 숫자만 */
export function formatKrwVar(n: number | null | undefined): string {
  return KRW.format(Math.max(0, Math.round(n ?? 0)));
}

const KST_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
});
const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * 촬영일 변수 — `9월 12일 (토) 오후 2:00`. 시각이 없으면(`shoot_date` 만) 날짜까지만.
 * 둘 다 없으면 '협의 중' — 템플릿 변수는 비면 안 되므로 빈 문자열 대신 말이 되는 값을 준다.
 */
export function formatShootDateVar(shootAt: string | null | undefined, shootDate?: string | null): string {
  if (shootAt) {
    const d = new Date(shootAt);
    if (!isNaN(d.getTime())) {
      return `${KST_DATE.format(d)} ${KST_TIME.format(d).replace(/:00$/, "시").replace(/(\d)시$/, "$1시")}`;
    }
  }
  if (shootDate && /^\d{4}-\d{2}-\d{2}$/.test(shootDate)) {
    const d = new Date(`${shootDate}T00:00:00+09:00`);
    if (!isNaN(d.getTime())) return KST_DATE.format(d);
  }
  return "협의 중";
}

/** 이름 변수 — 비어 있으면 역할명으로 */
export function nameVar(name: string | null | undefined, fallback: string): string {
  const s = (name ?? "").trim();
  return s.length > 0 ? s : fallback;
}

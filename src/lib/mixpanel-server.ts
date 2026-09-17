import "server-only";

// Mixpanel 서버측 트래킹 — 예약·결제·리드·리뷰 등 "행위자와 귀속 대상이 다른"
// 전환 이벤트를 정확한 대상(고객/작가)의 distinct_id 로 기록한다.
// (Meta Pixel↔CAPI 와 동일한 이원화: 브라우저 인게이지먼트 = mixpanel-browser,
//  서버 전환 = 이 모듈. 식별자는 profiles.id = auth.users.id 로 클라이언트와 병합됨)
//
// - NEXT_PUBLIC_MIXPANEL_TOKEN(공개 토큰)이 없으면 no-op → 토큰 등록 전엔 안전.
// - $insert_id 를 결정적으로 주면 재시도(멱등 서버액션)에도 Mixpanel 이 자동 중복 제거.
// - 전송 실패가 본 트랜잭션(예약·결제)을 막지 않도록 에러는 전부 삼킨다.

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

// 비운영 환경 가드 — 브라우저 쪽(lib/mixpanel.ts)에는 있는데 **여기엔 없었다.**
// 거기 주석에 "2026-08 스캔에서 localhost 이벤트 2,900여 개가 프로덕션 Mixpanel 에
// 유입된 것 확인" 이라고 적혀 있다. 서버 이벤트도 같은 경로로 새고 있었다 —
// .env.local 에 토큰이 있으면 로컬 개발이 그대로 운영 지표에 섞인다.
//
// 브라우저는 hostname 으로 걸렀지만 서버엔 hostname 이 없다. Vercel 프리뷰는
// NODE_ENV 가 "production" 이라 그것만으론 못 거르므로 VERCEL_ENV 를 같이 본다.
function nonProduction(): boolean {
  const vercelEnv = process.env.VERCEL_ENV; // production | preview | development
  if (vercelEnv) return vercelEnv !== "production";
  return process.env.NODE_ENV !== "production";
}

/**
 * 서버 이벤트 1건 전송.
 * @param event      이벤트명 (예: "Confirm Payment")
 * @param distinctId 귀속 대상 profiles.id (고객/작가). 없으면 no-op.
 * @param props      이벤트 프로퍼티 (PII 금지 — id·금액·상태만)
 * @param insertId   중복 제거 키. 멱등 액션은 `${event}:${엔티티id}` 형태 권장.
 */
export async function mpTrackServer(
  event: string,
  distinctId: string | null | undefined,
  props?: Record<string, unknown>,
  insertId?: string,
): Promise<void> {
  if (!TOKEN || !distinctId || nonProduction()) return;
  try {
    const payload = [
      {
        event,
        properties: {
          token: TOKEN,
          distinct_id: distinctId,
          time: Math.floor(Date.now() / 1000),
          $insert_id: insertId ?? `${event}:${distinctId}:${Date.now()}`,
          // 서버 발화 표식(클라이언트 이벤트와 구분/디버깅용)
          $source: "server",
          ...props,
        },
      },
    ];
    await fetch("https://api.mixpanel.com/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        accept: "text/plain",
      },
      body: "data=" + encodeURIComponent(JSON.stringify(payload)),
    });
  } catch {
    /* 분석 실패가 트랜잭션을 막지 않게 무시 */
  }
}

/**
 * 매출 기록(LTV) — Mixpanel Engage 로 유저 프로필에 거래 1건 적립.
 * · $transactions 에 거래(금액·시각) append → Mixpanel Revenue 리포트 집계
 * · total_spent_krw / paid_bookings 증분 → 재구매·VIP 코호트 정밀화
 * confirmBankTransfer 가 멱등(accepted→paid 1회)이라 이중 적립 없음.
 */
export async function mpRevenueServer(
  distinctId: string | null | undefined,
  amountKrw: number | null | undefined,
): Promise<void> {
  if (!TOKEN || !distinctId || !amountKrw || amountKrw <= 0 || nonProduction()) return;
  try {
    const now = new Date().toISOString();
    const data = [
      {
        $token: TOKEN,
        $distinct_id: distinctId,
        $append: { $transactions: { $time: now, $amount: amountKrw } },
      },
      {
        $token: TOKEN,
        $distinct_id: distinctId,
        $add: { total_spent_krw: amountKrw, paid_bookings: 1 },
      },
    ];
    await fetch("https://api.mixpanel.com/engage", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        accept: "text/plain",
      },
      body: "data=" + encodeURIComponent(JSON.stringify(data)),
    });
  } catch {
    /* 무시 */
  }
}

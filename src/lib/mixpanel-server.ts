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
  if (!TOKEN || !distinctId) return;
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

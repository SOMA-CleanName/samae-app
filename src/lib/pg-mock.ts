import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "crypto";

// ════════════════════════════════════════════════════════════════
// Mock PG (포트원/토스 webhook 계약 미러링)
//
// 실 PG 연동 시 이 모듈만 교체하면 된다 (서명 검증·이벤트 파싱 경계).
// 실제 포트원은 webhook 수신 후 PG API로 결제 재조회해 검증하지만,
// Mock 은 공유 시크릿 HMAC-SHA256 서명으로 동일한 "신뢰 경계"를 흉내낸다.
// ════════════════════════════════════════════════════════════════

const SECRET = process.env.PAYMENT_WEBHOOK_SECRET || "";
export const PG_SIGNATURE_HEADER = "x-pg-signature";

// PG webhook 이벤트 (결제 성공 통지)
export type PgWebhookEvent = {
  pg_tx_id: string; // PG 거래 고유 ID (= 우리가 prepare 때 생성한 결제 ID)
  booking_id: string;
  amount_krw: number;
  status: "paid" | "failed";
  paid_at: string; // ISO
};

// PG 거래 ID 생성 (prepare 단계). 실 PG에선 SDK가 발급.
export function newPgTxId(): string {
  return `mockpg_${randomUUID()}`;
}

// 페이로드 서명 (mock 결제 승인 측 = PG 역할)
export function signPayload(rawBody: string): string {
  return createHmac("sha256", SECRET).update(rawBody).digest("hex");
}

// 서명 검증 (webhook 수신 측). 타이밍 안전 비교.
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!SECRET || !signature) return false;
  const expected = signPayload(rawBody);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

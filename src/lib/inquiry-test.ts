import "server-only";

import type { CurrentUser } from "@/lib/auth";

/**
 * 테스트 문의 판정.
 *
 * 배경: 2026-08-27 챗봇 개발 중 넣은 테스트 문의가 실제 작가에게 전달됐고,
 * 작가가 리드비 10,000원을 입금한 뒤 안내를 받고 포트폴리오를 전부 내렸다.
 * "조심하기"로는 재발을 막을 수 없어서 판정을 코드에 박는다.
 *
 * 두 갈래로 잡는다 — 어느 한쪽만으로는 새는 구멍이 있다:
 *   ① 운영자(admin) 계정으로 접수 — 로그인 상태로 테스트할 때
 *   ② 테스트 연락처 목록(TEST_INQUIRY_PHONES) — 로그아웃/시크릿창으로 테스트할 때
 *
 * ⚠️ 운영자가 고객을 대신해 진짜 문의를 넣어야 하는 경우가 생기면 ① 때문에 테스트로 잡힌다.
 *    그때는 어드민 목록에서 테스트 표시를 해제하는 편이 안전하다 —
 *    기본값을 "작가에게 안 보냄" 쪽에 두는 게 이 사고의 교훈이다.
 */

/** `TEST_INQUIRY_PHONES` — 쉼표로 구분. 예: "010-1234-5678,010-9999-0000" */
function testPhones(): Set<string> {
  const raw = process.env.TEST_INQUIRY_PHONES ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => normalizePhone(s))
      .filter(Boolean),
  );
}

/** 하이픈·공백 차이로 매칭이 어긋나지 않게 숫자만 남긴다. */
function normalizePhone(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

export function isTestInquiry(params: {
  me: CurrentUser | null;
  phone: string | null;
}): boolean {
  if (params.me?.role === "admin") return true;

  const phone = normalizePhone(params.phone);
  if (phone && testPhones().has(phone)) return true;

  return false;
}

/** 어드민·디스코드 표시용 사유 — 왜 테스트로 잡혔는지 사람이 알 수 있게. */
export function testInquiryReason(params: {
  me: CurrentUser | null;
  phone: string | null;
}): string | null {
  if (params.me?.role === "admin") return "운영자 계정 접수";
  const phone = normalizePhone(params.phone);
  if (phone && testPhones().has(phone)) return "테스트 연락처";
  return null;
}

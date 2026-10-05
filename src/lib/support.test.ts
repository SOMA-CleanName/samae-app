import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORT_KINDS,
  PHOTOGRAPHER_SUPPORT_KINDS,
  SUPPORT_KIND_LABEL,
  SUPPORT_KIND_HINT,
  isSupportKind,
  isUrgentSupportKind,
} from "./support";

test("신고·개인정보가 종류에 들어왔다 (0137)", () => {
  assert.equal(isSupportKind("report"), true);
  assert.equal(isSupportKind("privacy"), true);
});

test("모르는 종류는 거른다 — DB check 제약과 어긋나면 insert 가 터진다", () => {
  for (const bad of ["reports", "PRIVACY", "", null, 1, "delete"]) {
    assert.equal(isSupportKind(bad), false, `${String(bad)} 는 종류가 아니다`);
  }
});

test("고객은 신고할 수 있다", () => {
  assert.ok(SUPPORT_KINDS.includes("report"));
});

test("작가도 신고할 수 있다 — 고객이 곤란하게 하는 경우도 있다", () => {
  assert.ok(PHOTOGRAPHER_SUPPORT_KINDS.includes("report"));
});

test("고객 창구에 날짜 변경은 없다 — 채팅의 일정 변경 카드로 간다 (취소환불 7조)", () => {
  assert.equal(SUPPORT_KINDS.includes("reschedule"), false);
});

test("고르는 종류는 전부 라벨과 안내가 있다", () => {
  // 안내가 없으면 문의 창에 빈 칸이 뜬다
  for (const k of [...SUPPORT_KINDS, ...PHOTOGRAPHER_SUPPORT_KINDS]) {
    assert.ok(SUPPORT_KIND_LABEL[k]?.trim(), `${k} 라벨 없음`);
    assert.ok(SUPPORT_KIND_HINT[k]?.trim(), `${k} 안내 없음`);
  }
});

test("모든 종류에 라벨이 있다 — 접수함이 원문 코드를 보여주면 안 된다", () => {
  for (const k of Object.keys(SUPPORT_KIND_LABEL)) {
    assert.equal(isSupportKind(k), true, `${k} 가 판별에서 빠졌다`);
  }
});

test("급한 것은 신고와 개인정보뿐", () => {
  assert.equal(isUrgentSupportKind("report"), true);
  assert.equal(isUrgentSupportKind("privacy"), true);
  for (const k of ["refund", "other", "photographer_cancel", "reschedule"]) {
    assert.equal(isUrgentSupportKind(k), false, `${k} 는 급한 분류가 아니다`);
  }
});

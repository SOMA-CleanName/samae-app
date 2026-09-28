import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_ACTIONS,
  adminActionLabel,
  isAdminActionKey,
  isHeavyAction,
} from "./admin-audit-labels";

test("등록된 액션은 사람이 읽는 이름이 있다", () => {
  assert.equal(adminActionLabel("refund"), "환불 처리");
  assert.equal(adminActionLabel("photographer_remove"), "작가 퇴출");
});

test("모르는 값은 감추지 않고 원문을 보여준다", () => {
  // 오타로 들어간 액션을 "-" 로 가려 버리면 그 기록이 영영 안 보인다
  assert.match(adminActionLabel("refnud"), /알 수 없는 동작/);
  assert.match(adminActionLabel("refnud"), /refnud/);
});

test("액션 키 판별", () => {
  assert.equal(isAdminActionKey("settle"), true);
  assert.equal(isAdminActionKey("settlee"), false);
  assert.equal(isAdminActionKey(null), false);
  assert.equal(isAdminActionKey(123), false);
});

test("돈이 이미 나간 것과 사라지는 것만 무겁게 본다", () => {
  for (const k of ["settle", "refund", "refund_paid", "photographer_remove"]) {
    assert.equal(isHeavyAction(k), true, `${k} 는 무거워야 한다`);
  }
  // 되돌리면 그만인 것들
  for (const k of ["photographer_approve", "user_ban", "user_role", "deposit_confirm"]) {
    assert.equal(isHeavyAction(k), false, `${k} 는 무겁지 않다`);
  }
});

test("무겁다고 표시된 액션은 전부 등록된 것이다", () => {
  // HEAVY 에 오타가 있으면 영영 강조가 안 되는데 아무도 모른다
  const heavy = Object.keys(ADMIN_ACTIONS).filter(isHeavyAction);
  assert.equal(heavy.length, 6, `무거운 액션 수가 달라졌다: ${heavy.join(", ")}`);
});

test("라벨이 비거나 겹치지 않는다", () => {
  const labels = Object.values(ADMIN_ACTIONS);
  for (const l of labels) assert.ok(l.trim().length > 0);
  assert.equal(new Set(labels).size, labels.length, "같은 이름이 둘 이상이면 목록에서 구분이 안 된다");
});

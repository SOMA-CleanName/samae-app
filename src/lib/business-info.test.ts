import assert from "node:assert/strict";
import test from "node:test";
import { BUSINESS_INFO, businessInfoRows } from "./business-info.ts";

test("결제채널 심사가 대조하는 세 항목은 맨 앞에 항상 그려진다", () => {
  const rows = businessInfoRows();
  assert.deepEqual(
    rows.slice(0, 3).map((r) => [r.label, r.value]),
    [
      ["상호", "사매"],
      ["대표자", "김정훈"],
      ["사업자등록번호", "827-70-00636"],
    ]
  );
});

test("현재 지면에 나가는 항목 — 신고번호만 아직 비어 있다", () => {
  assert.equal(BUSINESS_INFO.mailOrderNumber, undefined);
  assert.deepEqual(businessInfoRows().map((r) => r.label), [
    "상호",
    "대표자",
    "사업자등록번호",
    "대표전화",
    "이메일",
  ]);
});

test("아직 없는 항목은 줄째로 빠지고, 채우면 그 자리에 들어간다", () => {
  const labels = businessInfoRows({
    ...BUSINESS_INFO,
    mailOrderNumber: "제2026-인천연수-00001호",
  }).map((r) => r.label);
  assert.deepEqual(labels, [
    "상호",
    "대표자",
    "사업자등록번호",
    "통신판매업 신고번호",
    "대표전화",
    "이메일",
  ]);
});

test("공백만 있는 값도 없는 것으로 본다", () => {
  const labels = businessInfoRows({ ...BUSINESS_INFO, phone: "   " }).map((r) => r.label);
  assert.equal(labels.includes("대표전화"), false);
});

// 아래 둘은 주석으로만 적어두면 언젠가 지워진다. 실수하면 지면에 그대로 나가는 값이라 테스트로 막는다.
test("대표전화에 개인 휴대폰 번호를 넣지 않는다", () => {
  assert.equal(
    BUSINESS_INFO.phone?.startsWith("010"),
    false,
    "이 번호는 지면·광고·PG 가맹점 정보로 그대로 퍼진다. 사업용 회선을 쓸 것"
  );
});

test("대표 이메일은 팀 공유 계정을 쓴다", () => {
  assert.equal(BUSINESS_INFO.email, "samaephoto@gmail.com");
});

import assert from "node:assert/strict";
import test from "node:test";
import { BUSINESS_INFO, businessInfoRows } from "./business-info.ts";

test("결제채널 심사가 대조하는 세 항목은 항상 그려진다", () => {
  const rows = businessInfoRows();
  assert.deepEqual(
    rows.map((r) => [r.label, r.value]),
    [
      ["상호", "사매"],
      ["대표자", "김정훈"],
      ["사업자등록번호", "827-70-00636"],
    ]
  );
});

test("아직 없는 항목은 줄째로 빠지고, 채우면 그 자리에 들어간다", () => {
  assert.equal(BUSINESS_INFO.mailOrderNumber, undefined);
  const labels = businessInfoRows({
    ...BUSINESS_INFO,
    mailOrderNumber: "제2026-인천연수-00001호",
    email: "help@samae.ai",
  }).map((r) => r.label);
  assert.deepEqual(labels, ["상호", "대표자", "사업자등록번호", "통신판매업 신고번호", "이메일"]);
});

test("공백만 있는 값도 없는 것으로 본다", () => {
  const labels = businessInfoRows({ ...BUSINESS_INFO, phone: "   " }).map((r) => r.label);
  assert.equal(labels.includes("대표전화"), false);
});

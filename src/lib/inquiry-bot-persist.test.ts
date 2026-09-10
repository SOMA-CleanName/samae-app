import assert from "node:assert/strict";
import test from "node:test";
import { buildFlow } from "./inquiry-bot.ts";
import {
  buildBotNote,
  buildLegacyInquiryFormData,
  type BotConversationRecord,
} from "./inquiry-bot-persist.ts";

const STEPS = buildFlow();

function baseRecord(over: Partial<BotConversationRecord> = {}): BotConversationRecord {
  return {
    photographerId: "pg-1",
    photoId: "ph-1",
    slots: { purpose: "웨딩", preferredDate: "2026-09-12", region: "서울", partySize: "2명" },
    transcript: [],
    contact: { type: "phone", value: "010-1234-5678" },
    referenceImageUrls: [],
    referenceImageCount: 0,
    ...over,
  };
}

test("buildLegacyInquiryFormData — 코어 필드·전화 포맷·어트리뷰션이 submitInquiry 계약대로", () => {
  const fd = buildLegacyInquiryFormData(
    STEPS,
    baseRecord({ attribution: { utm_source: "insta", landing_path: "/photos/1" } })
  );
  assert.equal(fd.get("photographerId"), "pg-1");
  assert.equal(fd.get("purpose"), "웨딩");
  assert.equal(fd.get("preferredDate"), "2026년 9월 12일 (토)"); // ISO → 한국어 표기 (위저드 규칙)
  assert.equal(fd.get("partySize"), "2명");
  assert.equal(fd.get("phone"), "010-1234-5678");
  assert.equal(fd.get("kakaoId"), null);
  assert.equal(fd.get("utm_source"), "insta");
  assert.equal(fd.get("landing_path"), "/photos/1");
});

test("buildLegacyInquiryFormData — 카톡 연락처·partySize 소프트스킵은 미입력 처리", () => {
  const fd = buildLegacyInquiryFormData(
    STEPS,
    baseRecord({
      slots: { purpose: "웨딩", preferredDate: "미정", region: "서울", partySize: "미정" },
      contact: { type: "kakao", value: " my_kakao1 " },
    })
  );
  assert.equal(fd.get("kakaoId"), "my_kakao1");
  assert.equal(fd.get("phone"), null);
  assert.equal(fd.get("partySize"), ""); // 스킵 라벨("미정")은 값으로 저장하지 않음
});

test("buildBotNote — 커스텀 답변과 레퍼런스 이미지가 note 로 직조", () => {
  const withRefs = buildBotNote(
    baseRecord({
      slots: { custom: { "배경·분위기": "필름 감성" } },
      referenceImageUrls: ["https://x/a.jpg"],
      referenceImageCount: 1,
    })
  );
  assert.ok(withRefs.startsWith("[챗봇 수집]"));
  assert.ok(withRefs.includes("배경·분위기: 필름 감성"));
  assert.ok(withRefs.includes("레퍼런스 이미지 1장: https://x/a.jpg"));

  // 드라이런 — URL 없이 첨부 수만
  const dryRun = buildBotNote(baseRecord({ referenceImageCount: 2 }));
  assert.ok(dryRun.includes("레퍼런스 이미지 2장 첨부 (개발 모드 — 미업로드)"));

  // 아무것도 없으면 빈 문자열 (note 미전송)
  assert.equal(buildBotNote(baseRecord()), "");
});

import assert from "node:assert/strict";
import test from "node:test";
import { detectOffPlatform } from "./moderation.ts";

test("오프플랫폼 유도 — 확실한 신호는 차단", () => {
  const blocked = [
    "010-7715-5195로 연락주세요",
    "01077155195 문자주세요",
    "인스타 아이디 murufilm 으로 디엠 주세요",
    "카톡 아이디 알려주시면 거기서 얘기해요",
    "open.kakao.com/o/abc123 여기로 오세요",
    "제 인스타 @muru.film 팔로우하고 DM주세요",
    "텔레그램 t.me/muru 로 연락주세요",
  ];
  for (const t of blocked) assert.ok(detectOffPlatform(t).length > 0, `차단돼야 함: ${t}`);
});

test("오프플랫폼 유도 — 단순 언급·일상 대화는 통과", () => {
  const allowed = [
    "인스타에 올리신 사진 너무 좋았어요",
    "네 토요일 오후 2시에 뵐게요! 장소는 연남동이요",
    "보정본은 20장 드리고 있어요",
    "야간 촬영도 가능해요, 조명 준비해 갈게요",
  ];
  for (const t of allowed) assert.deepEqual(detectOffPlatform(t), [], `통과돼야 함: ${t}`);
});

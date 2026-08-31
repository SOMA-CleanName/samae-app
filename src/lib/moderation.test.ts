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
    // 실측된 우회 시도들
    "공일공77155195",
    "공일공 칠칠일오 오일구오",
    "카톡jh011010",
    "@kimjazz99로 연락주세요",
    "kimjazz99 잉스타연락",
    "메일로 보내주세요 kimjazz@gmail.com",
    "010 7715 5195",
    "0 1 0 7 7 1 5 5 1 9 5",
  ];
  for (const t of blocked) assert.ok(detectOffPlatform(t).length > 0, `차단돼야 함: ${t}`);
});

test("개인 계좌 유도 — 은행·계좌 단어 + 계좌번호는 차단", () => {
  const blocked = [
    "국민은행 123456-78-901234로 입금해주세요",
    "카카오뱅크 3333-05-1234567",
    "토스뱅크 1000-1234-5678-90 입니다",
    "계좌번호는 3521051234567 이에요",
    "여기로 이체해주세요 110-123-456789 신한",
    "무통장 입금은 352-1051-2345-13",
  ];
  for (const t of blocked) assert.ok(detectOffPlatform(t).length > 0, `차단돼야 함: ${t}`);
});

test("개인 계좌 유도 — 가격·입금 언급만은 통과", () => {
  const allowed = [
    "총 금액은 150,000원이에요, 입금 확인되면 확정돼요",
    "사매 계좌로 입금했어요!",
    "예약금 50,000원 송금 완료했습니다",
    "입금 확인 부탁드려요",
  ];
  for (const t of allowed) assert.deepEqual(detectOffPlatform(t), [], `통과돼야 함: ${t}`);
});

test("오프플랫폼 유도 — 단순 언급·일상 대화는 통과", () => {
  const allowed = [
    "인스타에 올리신 사진 너무 좋았어요",
    "네 토요일 오후 2시에 뵐게요! 장소는 연남동이요",
    "보정본은 20장 드리고 있어요",
    "야간 촬영도 가능해요, 조명 준비해 갈게요",
    "총 금액은 150,000원이에요",
    "12월 25일 오후 3시 어떠세요?",
    "일정이 삼일 뒤라 조금 빠듯해요",
  ];
  for (const t of allowed) assert.deepEqual(detectOffPlatform(t), [], `통과돼야 함: ${t}`);
});

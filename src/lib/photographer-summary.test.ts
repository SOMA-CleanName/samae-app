import { test } from "node:test";
import assert from "node:assert/strict";
import { photographerSummary } from "./photographer-summary";

test("지역과 무드가 있으면 한 문장으로 붙인다", () => {
  assert.equal(
    photographerSummary({
      regions: ["서울", "인천"],
      moodTags: ["일본무드", "시네마틱"],
      packageCount: 2,
      minPriceKrw: 120000,
    }),
    "서울 · 인천에서 일본무드 · 시네마틱 무드로 촬영합니다. 촬영 패키지 2종, 12만원부터 예약할 수 있어요."
  );
});

test("없는 사실을 만들지 않는다", () => {
  /*
    ⚠️ 여기가 이 함수에서 제일 중요한 규칙이다. 문장을 채우려고 "다양한 지역에서" 같은
       말을 넣으면 그건 우리가 지어낸 것이고, **AI 가 그걸 사실로 인용한다.**
  */
  // 지역만
  assert.equal(photographerSummary({ regions: ["성수"] }), "성수에서 촬영합니다.");
  // 무드만
  assert.equal(photographerSummary({ moodTags: ["감성"] }), "감성 무드로 촬영합니다.");
  // 패키지는 있는데 가격이 없으면 가격을 말하지 않는다
  assert.equal(
    photographerSummary({ packageCount: 3, minPriceKrw: null }),
    "촬영 패키지 3종이 있어요."
  );
  assert.equal(photographerSummary({ packageCount: 1, minPriceKrw: 0 }), "촬영 패키지 1종이 있어요.");
});

test("말할 게 없으면 빈 문자열 — 빈 문단을 세우지 않는다", () => {
  assert.equal(photographerSummary({}), "");
  assert.equal(photographerSummary({ regions: [], moodTags: [], packageCount: 0 }), "");
  assert.equal(photographerSummary({ regions: null, moodTags: null }), "");
  // 공백만 있는 태그도 없는 것으로 본다
  assert.equal(photographerSummary({ regions: ["  ", ""] }), "");
});

test("나열이 길면 '등' 으로 줄인다 — 문장이 목록 세는 말이 되면 안 된다", () => {
  /*
    처음엔 "외 2" 로 적었더니 **"감성 외 2 무드의 사진"** 처럼 읽혔다. 숫자를 문장
    한가운데 넣으면 문장이 아니라 목록이 된다. "등" 은 더 있다는 사실을 그대로 말하면서
    문장을 깨지 않는다.
  */
  assert.equal(photographerSummary({ moodTags: ["a","b","c","d","e"] }), "a · b · c 등 무드로 촬영합니다.");
  assert.equal(photographerSummary({ moodTags: ["a","b","c"] }), "a · b · c 무드로 촬영합니다.");
});

test("가격은 읽기 쉬운 단위로", () => {
  const price = (n: number) =>
    photographerSummary({ packageCount: 1, minPriceKrw: n }).match(/, (.+?)부터/)?.[1];
  assert.equal(price(120000), "12만원");
  assert.equal(price(90000), "9만원");
  // 만원으로 안 떨어지면 그대로 적는다 — 반올림해서 틀린 값을 말하지 않는다
  assert.equal(price(85000), "85,000원");
});

test("패키지가 0이면 패키지 이야기를 안 한다", () => {
  assert.equal(photographerSummary({ regions: ["서울"], packageCount: 0 }), "서울에서 촬영합니다.");
});

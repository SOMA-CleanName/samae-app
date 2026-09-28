import { test } from "node:test";
import assert from "node:assert/strict";
import { pickWindow, shuffle } from "./random-pick";

/** rand() 를 고정해 경계를 확인한다 — Math.random 으로는 "0 일 때/1 직전일 때" 를 못 본다 */
const always = (v: number) => () => v;
const NEARLY_ONE = 1 - Number.EPSILON;

test("창이 목록을 넘어가지 않는다", () => {
  // 넘어가면 .range() 가 빈 배열을 돌려주고 배경이 통째로 사라진다
  for (const total of [1, 5, 17, 18, 71, 72, 73, 873]) {
    for (const r of [0, 0.5, NEARLY_ONE]) {
      const { start, size } = pickWindow(total, 18, always(r));
      assert.ok(start >= 0, `start 가 음수: ${start}`);
      assert.ok(size > 0 && size <= total, `size 가 범위 밖: ${size}/${total}`);
      assert.ok(start + size <= total, `창이 넘침: ${start}+${size} > ${total}`);
    }
  }
});

test("맨 끝 사진도 뽑힌다", () => {
  /*
    `Math.floor(rand() * maxStart)` 로 쓰면 start 가 maxStart 에 **영영 못 닿아서**
    목록 마지막 한 장이 한 번도 안 나온다. +1 이 그래서 있다.
  */
  const total = 100;
  const { start, size } = pickWindow(total, 18, always(NEARLY_ONE));
  assert.equal(size, 72);
  assert.equal(start, total - size, "가장 늦은 시작점까지 닿아야 한다");
  assert.equal(start + size, total);
});

test("rand 가 0 이면 맨 앞", () => {
  assert.deepEqual(pickWindow(100, 18, always(0)), { start: 0, size: 72 });
});

test("사진이 창보다 적으면 통째로 — 마지막 창이 휑해지지 않게", () => {
  // total 40, want 18 → 창 72 는 못 채우니 40 전부. 이때 start 는 0 말고 답이 없다
  for (const r of [0, 0.5, NEARLY_ONE]) {
    assert.deepEqual(pickWindow(40, 18, always(r)), { start: 0, size: 40 });
  }
});

test("사진이 없으면 size 0 — 호출부가 DB 를 치지 않게", () => {
  assert.deepEqual(pickWindow(0, 18), { start: 0, size: 0 });
  assert.deepEqual(pickWindow(-1, 18), { start: 0, size: 0 });
  assert.deepEqual(pickWindow(100, 0), { start: 0, size: 0 });
});

test("rand 가 1 을 돌려줘도 넘치지 않는다", () => {
  // 스펙상 Math.random() 은 1 미만이지만, 스텁이나 다른 구현이 들어올 수 있다
  const { start, size } = pickWindow(100, 18, always(1));
  assert.equal(start + size, 100);
});

test("셔플은 원본을 건드리지 않고 같은 것들을 돌려준다", () => {
  const src = Object.freeze(["a", "b", "c", "d", "e"]);
  const out = shuffle(src, always(0));
  assert.deepEqual([...src], ["a", "b", "c", "d", "e"], "원본이 바뀌었다");
  assert.deepEqual([...out].sort(), [...src].sort(), "원소가 없어지거나 늘었다");
  assert.notEqual(out, src);
});

test("셔플이 실제로 섞는다", () => {
  const src = Array.from({ length: 20 }, (_, i) => i);
  // 재현 가능한 의사난수 — Math.random 을 쓰면 아주 드물게 원본과 같아 테스트가 깜빡인다
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  assert.notDeepEqual(shuffle(src, rand), src);
});

test("빈 목록·한 장짜리도 터지지 않는다", () => {
  assert.deepEqual(shuffle([]), []);
  assert.deepEqual(shuffle(["only"]), ["only"]);
});

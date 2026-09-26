import { test } from "node:test";
import assert from "node:assert/strict";
import { isUsablePlace, displayPlace, canonicalPlace, groupPlaces } from "./location-text";

test("「협의」류는 장소가 아니다", () => {
  /*
    실제 값들이다(2026-09-27). 사진 지면에 **「촬영 장소: 협의」** 라고 적히고 있었고,
    스팟 매칭에도 아무 데 안 붙어 64장이 장소 정보를 버리고 있었다.
  */
  for (const t of [
    "협의",
    "스튜디오 협의",
    "수도권 내 협의 후 진행",
    "수도권 호리존 스튜디오 협의 후 진행",
    "눈이 오는 수도권 지역 어디든",
    "지하철역 (별도 장소 안내)",
    "건물 안 (별도 장소 안내)",
    "서울 어딘가",
  ]) {
    assert.equal(isUsablePlace(t), false, `장소로 잡혔다: ${t}`);
    assert.equal(displayPlace(t), null);
  }
});

test("넓은 지명만 있으면 장소가 아니다", () => {
  for (const t of ["서울", "경기", "부산", "공원", "스튜디오", "야외", "골목"]) {
    assert.equal(isUsablePlace(t), false, `장소로 잡혔다: ${t}`);
  }
});

test("⚠️ 포함이 아니라 정확히 같을 때만 넓다고 본다", () => {
  /*
    "서울" 을 포함으로 막으면 **서울숲·서울시립미술관**까지 걸린다.
    실제 스팟 하나가 서울숲이다.
  */
  for (const t of ["서울숲", "서울시립미술관", "공원 앞 골목", "경기 광교카페거리", "부산 감천문화마을"]) {
    assert.equal(isUsablePlace(t), true, `엉뚱하게 막혔다: ${t}`);
    assert.equal(displayPlace(t), t);
  }
});

test("같은 곳이 표기만 달라 갈라지지 않게", () => {
  /*
    「소희재스튜디오」15장 + 「소희재 스튜디오.」13장 = 28장인데, 갈라져 있어서
    **둘 다 9장 기준에 미달**이었다. 합치면 넘는다.
  */
  assert.equal(canonicalPlace("소희재스튜디오"), canonicalPlace("소희재 스튜디오."));
  assert.equal(canonicalPlace("  용산 공원  "), canonicalPlace("용산공원"));
  assert.equal(canonicalPlace("Seoul Forest"), canonicalPlace("seoulforest"));
});

test("빈 값·한 글자는 장소가 아니다", () => {
  for (const t of [null, undefined, "", "  ", "역"]) {
    assert.equal(isUsablePlace(t), false, `${t}`);
  }
});

test("묶으면 장수가 합쳐진다", () => {
  const g = groupPlaces([
    "소희재스튜디오", "소희재스튜디오", "소희재 스튜디오.",
    "협의", "서울", null,
    "을지로", "을지로",
  ]);
  assert.deepEqual(
    g.map((x) => [x.name, x.count]),
    [["소희재스튜디오", 3], ["을지로", 2]]
  );
  // 쓸 수 없는 표기는 아예 안 들어온다
  assert.equal(g.some((x) => x.name === "협의" || x.name === "서울"), false);
});

test("대표 표기는 가장 많이 쓰인 원문 — 이름을 지어내지 않는다", () => {
  /*
    우리가 "소희재 스튜디오" 같은 이름을 만들어 붙이면 **작가가 적은 적 없는 이름**이
    지면에 뜬다. 많이 쓰인 쪽을 그대로 쓴다.
  */
  const g = groupPlaces(["소희재 스튜디오.", "소희재 스튜디오.", "소희재스튜디오"]);
  assert.equal(g[0].name, "소희재 스튜디오.");
  assert.deepEqual(g[0].variants, ["소희재 스튜디오.", "소희재스튜디오"]);
});

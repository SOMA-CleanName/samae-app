import { test } from "node:test";
import assert from "node:assert/strict";
import { isSpotLive, spotLiveLabel, SPOT_MIN_PHOTOS } from "./spot-live";

test("켜는 기준과 계속 보여줄 기준이 같다", () => {
  /*
    운영자가 스팟을 켤 때 쓰는 기준이 "공개 사진 9장 이상" 이다. 계속 보여줄 기준을
    이보다 낮추면 **그 차이만큼 빈 지면이 남는다** — 실제로 경복궁(2장)·망원한강(8장)이
    기준 미달인 채 공개돼 있었다(2026-09-26).
  */
  assert.equal(SPOT_MIN_PHOTOS, 9);
  assert.equal(isSpotLive(9), true);
  assert.equal(isSpotLive(8), false);
  assert.equal(isSpotLive(0), false);
});

test("published 를 끄지 않는다 — 두 값은 다른 질문의 답이다", () => {
  /*
    published = 운영자가 "켜 두기로 했다"
    live      = "지금 보여줄 게 있다"
    같은 값으로 쓰면 사진이 다시 찼을 때 **사람이 다시 켜러 와야 한다.**
  */
  assert.deepEqual(spotLiveLabel({ published: true, photoCount: 20 }), {
    label: "공개",
    tone: "success",
  });
  assert.deepEqual(spotLiveLabel({ published: true, photoCount: 2 }), {
    label: "사진 부족 (2/9)",
    tone: "warning",
  });
  // 운영자가 직접 내린 것과 사진이 모자란 것은 다른 상태다
  assert.deepEqual(spotLiveLabel({ published: false, photoCount: 50 }), {
    label: "비공개",
    tone: "muted",
  });
  assert.deepEqual(spotLiveLabel({ published: false, photoCount: 0 }), {
    label: "비공개",
    tone: "muted",
  });
});

test("사진이 다시 차면 자동으로 돌아온다", () => {
  // 미달 → 충족으로 넘어가는 순간 아무도 손대지 않아도 live 가 된다
  assert.equal(isSpotLive(SPOT_MIN_PHOTOS - 1), false);
  assert.equal(isSpotLive(SPOT_MIN_PHOTOS), true);
  assert.equal(spotLiveLabel({ published: true, photoCount: SPOT_MIN_PHOTOS }).label, "공개");
});

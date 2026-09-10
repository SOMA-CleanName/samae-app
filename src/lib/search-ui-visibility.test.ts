import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowSearchUi } from "./search-ui-visibility.ts";

/*
  이 테스트는 "검색을 켤지 말지"를 정하는 게 아니라 **지금 켜기로 한 상태가 실수로
  바뀌지 않았는지**를 지킨다. 플래그를 손대면 이 파일도 같이 손대게 만드는 게 목적이다.

  지금 상태 (feat/seo-geo → dev, 2026-09-01)
    · home / results — 켬. 홈 상단 한 줄에 검색을 넣는 배치를 맞추는 중이다.
    · photo          — 끔. 사진 상세는 그 지면 배치를 아직 안 맞췄다.

  ⚠️ dev → main 전에 이 셋을 다시 정할 것. 검색 UI 노출은 배포되는 순간 사용자에게 보인다.
*/
test("검색 진입점 노출은 지면별로 정해 둔 값과 일치한다", () => {
  assert.equal(shouldShowSearchUi("home"), true);
  assert.equal(shouldShowSearchUi("results"), true);
  assert.equal(shouldShowSearchUi("photo"), false);
});

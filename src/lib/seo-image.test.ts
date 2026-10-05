import { test } from "node:test";
import assert from "node:assert/strict";
import { photoImageJsonLd, type PhotoMeta } from "./seo";

const photo: PhotoMeta = {
  id: "abc-123",
  src_url: "https://cdn.example/p.jpg",
  width: 1200,
  height: 1600,
  mood_tags: ["따뜻한", "필름"],
  region: "성수",
};

const ld = (name?: string | null) =>
  photoImageJsonLd(photo, name) as Record<string, unknown> & {
    creator?: { name?: string };
  };

test("저작권자는 작가다 — 회사가 아니다", () => {
  /*
    작가 이용약관 제17조 1항 "촬영 결과물의 저작권은 이를 촬영한 작가에게 있습니다"
    제20조 5항 "회사는 게재된 사진의 저작권을 취득하지 않는다"

    여기에 회사 이름이 들어가면 **약관과 어긋나는 주장을 구조화 데이터로 공표**하는 셈이다.
  */
  const d = ld("모글");
  assert.equal(d.copyrightNotice, "© 모글");
  assert.equal(d.creditText, "모글");
  assert.equal(d.creator?.name, "모글");
  for (const v of [d.copyrightNotice, d.creditText, d.creator?.name]) {
    assert.ok(!/samae|사매/i.test(String(v)), `저작권 표기에 회사 이름이 들어갔다: ${String(v)}`);
  }
});

test("이름을 모르면 일반명사로 — 빈 크레딧을 내보내지 않는다", () => {
  for (const missing of [null, undefined, "", "   "]) {
    const d = ld(missing);
    assert.equal(d.creator?.name, "사진작가");
    assert.equal(d.copyrightNotice, "© 사진작가");
    assert.equal(d.creditText, "사진작가");
  }
});

test("license·acquireLicensePage 는 넣지 않는다", () => {
  /*
    2026-09-21 결정. 그 둘을 채우면 구글 이미지에 「Licensable」 배지가 붙는데, 그건
    "이 사진의 라이선스를 받을 수 있다" 는 안내다. 사매가 파는 것은 촬영이지 사진 파일이
    아니고, 라이선스 문의를 작가에게 연결하는 경로도 아직 없다.

    이 테스트는 **실수로 켜지는 것**을 막는다. 켜려면 이 테스트를 고치게 되고, 그때
    "창구를 만들었나" 를 다시 묻게 된다.
  */
  const d = ld("모글");
  assert.equal("license" in d, false);
  assert.equal("acquireLicensePage" in d, false);
});

test("사진 식별 정보는 그대로 있다", () => {
  const d = ld("모글");
  assert.equal(d["@type"], "ImageObject");
  assert.equal(d.contentUrl, "https://cdn.example/p.jpg");
  assert.match(String(d.url), /\/photos\/abc-123$/);
  assert.equal(d.width, 1200);
  assert.equal(d.height, 1600);
});

test("촬영 장소가 없으면 contentLocation 을 만들지 않는다", () => {
  // 빈 Place 를 내보내면 장소 질의에 헛걸리는 사실이 생긴다
  const d = photoImageJsonLd({ ...photo, region: null, location_text: null }, "모글") as Record<string, unknown>;
  assert.equal("contentLocation" in d, false);
});

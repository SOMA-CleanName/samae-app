import { test } from "node:test";
import assert from "node:assert/strict";
import { thumbUrl } from "./image-thumb";

const BASE =
  "https://gdcqqregcreovsrthnvo.supabase.co/storage/v1/object/public/samae-portfolio/abc";

test("원본 → 같은 이름의 _thumb", () => {
  assert.equal(thumbUrl(`${BASE}/d9d6fa46.jpg`), `${BASE}/d9d6fa46_thumb.jpg`);
});

test("이미 썸네일이면 그대로 — 두 번 붙지 않는다", () => {
  const t = `${BASE}/d9d6fa46_thumb.jpg`;
  assert.equal(thumbUrl(t), t);
});

test("쿼리·해시는 보존한다 (서명 URL 등)", () => {
  assert.equal(
    thumbUrl(`${BASE}/d9d6fa46.jpg?token=xyz`),
    `${BASE}/d9d6fa46_thumb.jpg?token=xyz`
  );
});

test("Supabase Storage 가 아니면 손대지 않는다", () => {
  // 밖에서 가져온 커버 이미지에 _thumb 를 붙이면 404 가 된다
  const ext = "https://images.example.com/photo.jpg";
  assert.equal(thumbUrl(ext), ext);
});

test("확장자가 없으면 손대지 않는다", () => {
  const u = `${BASE}/d9d6fa46`;
  assert.equal(thumbUrl(u), u);
});

test("경로에만 점이 있고 파일명에 없으면 손대지 않는다", () => {
  const u = "https://x.supabase.co/storage/v1/object/public/a.b/file";
  assert.equal(thumbUrl(u), u);
});

test("null·빈 값은 그대로 — 호출부가 분기를 또 쓰지 않게", () => {
  assert.equal(thumbUrl(null), null);
  assert.equal(thumbUrl(undefined), undefined);
  assert.equal(thumbUrl(""), "");
});

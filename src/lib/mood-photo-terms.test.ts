import assert from "node:assert/strict";
import { test } from "node:test";
import type { Addition } from "./mood-additions";
import type { AuthorTag } from "./mood-author-tags";
import { baseLabel, isPlaceTerm, isPurposeTerm, isRelationOnly, mergePhotoTerms, photoAxisTally, selectPhotoTerms, stripSnap } from "./mood-photo-terms";

const E: Addition[] = [
  { label: "힙한", axes: ["스타일"], kind: "신조어", sources: ["shortlisted", "generated"], usage: "스트리트 느낌" },
  { label: "필름  감성", axes: ["스타일", "색감"], kind: "구절", sources: ["generated"], usage: "입자감" },
];
const T: AuthorTag[] = [
  { label: "힙한", photos: 12, photographers: 3, profiles: 1, inScreen: true },
  { label: "조용한", photos: 30, photographers: 5, profiles: 0, inScreen: true },
  { label: "웨딩스냅", photos: 2, photographers: 1, profiles: 0, inScreen: false },
  { label: "야구장스냅", photos: 4, photographers: 2, profiles: 0, inScreen: false },
  { label: "야구장", photos: 3, photographers: 1, profiles: 0, inScreen: false },
  { label: "스냅사진", photos: 9, photographers: 1, profiles: 0, inScreen: false },
];
const AX = new Map([["힙한", ["스타일"]], ["조용한", ["감정", "에너지"]]]);
const pickAll = (o: Partial<{ q: string; axis: string; from: string; dropped: boolean }>) =>
  selectPhotoTerms(mergePhotoTerms(E, T, AX), { q: "", axis: "", from: "", noAxis: "축 없음", ...o }).map((r) => r.label);

test("같은 표현은 합치고, 작가 태그만인 말은 1차 전처리 축을 물려받는다", () => {
  const rows = mergePhotoTerms(E, T, AX);
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.deepEqual(by["힙한"].from, ["shortlisted", "generated", "author"]);
  assert.equal(by["힙한"].photos, 12);
  assert.deepEqual(by["조용한"], { label: "조용한", axes: ["감정", "에너지"], kind: "작가 태그", usage: "", from: ["author"], photos: 30, photographers: 5, profiles: 0, inScreen: true });
  assert.deepEqual(by["필름"].axes, ["스타일", "색감"], "공백 정리 · 감성 뗌");
  assert.deepEqual(by["필름"].alt, ["필름 감성"]);
  assert.deepEqual(E[0].sources, ["shortlisted", "generated"], "원본은 건드리지 않는다");
});

test("꼬리의 감성 · 갬성은 떼고, 두 글자 미만 앞말이나 감성만인 말은 그대로 둔다 — 떼면 같은 말은 합친다", () => {
  assert.equal(baseLabel("가을 감성"), "가을");
  assert.equal(baseLabel("필름 갬성"), "필름");
  assert.equal(baseLabel("카페감성"), "카페");
  assert.equal(baseLabel("힙감성"), "힙감성", "앞말이 한 글자");
  assert.equal(baseLabel("감성"), "감성");
  assert.equal(baseLabel("감성스냅"), "감성", "스냅을 떼고 남은 감성은 둔다");
  assert.equal(baseLabel("감성 카페"), "감성 카페", "앞에 붙은 감성은 그대로");
  const rows = mergePhotoTerms([
    { label: "빈티지 감성", axes: ["스타일"], kind: "구절", sources: ["generated"], usage: "빈티지 사진" },
    { label: "빈티지", axes: ["스타일", "색감"], kind: "외래어", sources: ["shortlisted"], usage: "" },
    { label: "교토 감성", axes: ["공간"], kind: "구절", sources: ["generated"], usage: "" },
  ], [{ label: "빈티지감성", photos: 3, photographers: 1, profiles: 0, inScreen: false }], new Map(),
  [{ label: "교토 감성", action: "keep", at: "1" }]);
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.deepEqual(Object.keys(by).sort(), ["교토", "빈티지"]);
  assert.deepEqual(by["빈티지"].from, ["generated", "shortlisted", "author"]);
  assert.deepEqual(by["빈티지"].alt, ["빈티지 감성", "빈티지감성"]);
  assert.equal(by["빈티지"].photos, 3);
  assert.equal(by["교토"].drop, undefined, "옛 기록 '교토 감성' 이 지금 이름 교토에 맞는다");
  assert.equal(by["교토"].kept, true);
});

test("스냅은 떼고 앞말만 남긴다 — 스냅을 떼면 같은 말이 되는 태그는 합치고, 스냅만인 말은 버린다", () => {
  assert.equal(stripSnap("감성스냅"), "감성");
  assert.equal(stripSnap("야구장 스냅"), "야구장");
  assert.equal(stripSnap("선셋 스냅사진"), "선셋");
  assert.equal(stripSnap("스냅사진"), "");
  assert.equal(stripSnap("snap"), "");
  assert.equal(stripSnap("스냅백"), "스냅백", "끝이 스냅이 아니면 그대로");
  const by = Object.fromEntries(mergePhotoTerms(E, T, AX).map((r) => [r.label, r]));
  assert.equal(by["야구장"].photos, 7);
  assert.deepEqual(by["야구장"].alt, ["야구장스냅"]);
  assert.equal(by["웨딩"].drop, "목적");
  assert.equal("스냅사진" in by, false);
  assert.deepEqual(pickAll({ q: "야구장스냅" }), ["야구장"], "원래 표기로도 찾는다");
});

test("출처 · 축 · 검색으로 거르고, 뺀 말은 기본으로 안 보인다", () => {
  assert.deepEqual(pickAll({ from: "author" }), ["조용한", "힙한", "야구장"], "웨딩은 목적 말");
  assert.deepEqual(pickAll({ dropped: true }), ["웨딩"]);
  assert.deepEqual(pickAll({ from: "shortlisted" }), ["힙한"]);
  assert.deepEqual(pickAll({ axis: "색감" }), ["필름"]);
  assert.deepEqual(pickAll({ axis: "축 없음" }), ["야구장"]);
  assert.deepEqual(pickAll({ q: "입자" }), ["필름"]);
  assert.deepEqual(pickAll({ q: "필름 감성" }), ["필름"], "원래 표기로도 찾는다");
});

test("목적 · 관계가 분명한 말 — 커플 · 우정 · 가족 · 웨딩 · 프로필과 두 사람 사이 말은 빼고, 글자만 겹치는 것은 남긴다", () => {
  for (const w of ["커플 감성", "가족 케미", "우정샷", "찐친 느낌", "친구 같은 아빠", "흑백 프로필", "본식 스냅", "BFF", "연인이 찍어 준 듯한", "사랑꾼 남편", "리마인드촬영", "브라이덜샤워",
    "둘만의 시간", "서로 기댄", "눈맞춤", "손깍지", "백허그", "스킨십 있는", "썸 타는 느낌", "첫사랑 감성"]) {
    assert.equal(isPurposeTerm(w), true, w);
  }
  for (const w of ["다정한 시선", "케미 터지는", "알콩달콩", "썸머 감성", "베이비핑크", "아빠 미소", "연애 세포 깨우는", "애기애기한", "성수 감성"]) {
    assert.equal(isPurposeTerm(w), false, w);
  }
});

test("관계 축만 있는 말은 빼고, 다른 축이 같이 있거나 축이 잘못 붙은 촬영 말은 남긴다", () => {
  assert.equal(isRelationOnly("케미 터지는", ["관계"]), true);
  assert.equal(isRelationOnly("러블리", ["감정", "스타일", "관계"]), false);
  assert.equal(isRelationOnly("캔디드 컷", ["관계"]), false, "축이 잘못 붙은 촬영 말");
  const rows = mergePhotoTerms([
    { label: "알콩달콩", axes: ["관계"], kind: "기타", sources: ["generated"], usage: "" },
    { label: "달달한", axes: ["감정", "관계"], kind: "기타", sources: ["generated"], usage: "" },
  ], [], new Map());
  assert.deepEqual(rows.map((r) => [r.label, r.drop]), [["달달한", undefined], ["알콩달콩", "관계"]]);
});

test("시험 입력과 촬영 형식 말은 빼고, 스냅을 뗀 인물스냅도 형식이다", () => {
  const rows = mergePhotoTerms([], [
    { label: "qwer", photos: 1, photographers: 1, profiles: 0, inScreen: false },
    { label: "호리존", photos: 1, photographers: 1, profiles: 0, inScreen: false },
    { label: "인물스냅", photos: 1, photographers: 1, profiles: 0, inScreen: false },
    { label: "지하철", photos: 1, photographers: 1, profiles: 0, inScreen: false },
    { label: "컨셉촬영", photos: 1, photographers: 1, profiles: 0, inScreen: false },
  ], new Map());
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.label, r.drop ?? "무드"])), { qwer: "시험", 인물: "형식", 지하철: "무드", 호리존: "형식", 컨셉촬영: "형식" });
});

test("사람이 살리거나 뺀 기록은 규칙보다 세고, 마지막 줄이 이긴다", () => {
  const rows = mergePhotoTerms(E, T, AX, [
    { label: "웨딩", action: "keep", at: "1" },
    { label: "힙한", action: "drop", at: "2" },
    { label: "야구장", action: "drop", at: "3" },
    { label: "야구장", action: "keep", at: "4" },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(by["웨딩"].drop, undefined);
  assert.equal(by["웨딩"].kept, true);
  assert.equal(by["힙한"].drop, "사람");
  assert.equal(by["야구장"].drop, undefined, "뺐다가 다시 살렸다");
  assert.equal(by["야구장"].kept, undefined, "규칙으로 빠진 게 아니었으니 살린 표시도 없다");
});

test("다른 이름으로 살리면 감성을 뗀 이름이 되고, 이미 있는 말이면 거기에 합친다", () => {
  const rows = mergePhotoTerms([
    { label: "럽스타 감성", axes: ["감정", "관계"], kind: "외래어", sources: ["generated"], usage: "연인 사진" },
    { label: "신혼 감성", axes: ["관계"], kind: "구절", sources: ["generated"], usage: "" },
    { label: "신혼", axes: ["감정"], kind: "기타", sources: ["shortlisted"], usage: "새살림 느낌" },
  ], [{ label: "럽스타 감성", photos: 5, photographers: 2, profiles: 0, inScreen: false }], new Map(), [
    { label: "럽스타 감성", action: "keep", to: "럽스타", at: "1" },
    { label: "신혼 감성", action: "keep", to: "신혼", at: "2" },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal("럽스타 감성" in by, false);
  assert.deepEqual(by["럽스타"], { label: "럽스타", axes: ["감정", "관계"], kind: "외래어", usage: "연인 사진", from: ["generated", "author"], photos: 5, photographers: 2, profiles: 0, inScreen: false, alt: ["럽스타 감성"], kept: true },
    "목적 낱말(럽스타)이 들어 있어도 사람이 살렸으니 남는다 — 감성은 이제 규칙으로 떼지만 to 가 같은 이름이면 그냥 살리기");
  assert.deepEqual(by["신혼"].from, ["generated", "shortlisted"], "이미 있던 신혼에 합친다(감성은 규칙으로 먼저 떼니 입력 순서대로)");
  assert.deepEqual(by["신혼"].axes, ["관계", "감정"]);
  assert.deepEqual(by["신혼"].alt, ["신혼 감성"]);
  assert.equal(by["신혼"].usage, "새살림 느낌", "있던 용례를 지키고");
  assert.equal(by["신혼"].drop, undefined);
});

test("같은 낱말의 다른 표기는 대표에 흡수된다 — 원래 표기는 alt 로, 뺀 말은 흡수하지 않고, 사람이 그 이름으로 살린 말은 그대로 둔다", () => {
  const rows = mergePhotoTerms([
    { label: "노을", axes: ["빛"], kind: "기타", sources: ["generated"], usage: "붉게 물든 노을빛 사진" },
    { label: "노을 지는", axes: ["시간대"], kind: "구절", sources: ["shortlisted"], usage: "" },
    { label: "노을빛", axes: ["색감"], kind: "구절", sources: ["generated"], usage: "" },
    { label: "웨딩", axes: ["관계"], kind: "기타", sources: ["generated"], usage: "" },
    { label: "웨딩 무드", axes: ["관계"], kind: "구절", sources: ["generated"], usage: "" },
    { label: "청량", axes: ["온도"], kind: "기타", sources: ["generated"], usage: "" },
    { label: "청량미", axes: ["온도"], kind: "기타", sources: ["generated"], usage: "" },
  ], [{ label: "노을 지는", photos: 3, photographers: 1, profiles: 0, inScreen: false }], new Map(), [
    { label: "청량미", action: "keep", at: "1" },
  ], [], [
    { from: "노을 지는", to: "노을", how: "뿌리", at: "1" },
    { from: "노을빛", to: "노을", how: "뿌리", at: "1" },
    { from: "웨딩 무드", to: "웨딩", how: "뿌리", at: "1" },
    { from: "청량미", to: "청량", how: "뿌리", at: "1" },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal("노을 지는" in by, false);
  assert.equal("노을빛" in by, false);
  assert.deepEqual(by["노을"].alt, ["노을 지는", "노을빛"]);
  assert.deepEqual(by["노을"].axes, ["빛", "시간대", "색감"], "변형의 축은 대표에 모인다");
  assert.equal(by["노을"].photos, 3, "작가 사진 수도 모인다");
  assert.deepEqual(by["노을"].from, ["generated", "shortlisted", "author"]);
  assert.equal(by["노을"].kept, undefined, "흡수는 살린 표시가 아니다");
  assert.equal(by["웨딩 무드"].drop, "목적", "뺀 말은 흡수하지 않는다 — 뺀 채로 남는다");
  assert.equal(by["웨딩"].alt, undefined);
  assert.equal("청량미" in by, true, "사람이 그 이름으로 살린 말은 흡수하지 않는다");
});

test("축 없는 말에 사람이 붙인 축은 그 축, 이미 축이 있으면 건드리지 않는다", () => {
  const rows = mergePhotoTerms(E, T, AX, [], [{ label: "야구장", axes: ["공간"] }, { label: "조용한", axes: ["향"] }]);
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.deepEqual(by["야구장"].axes, ["공간"]);
  assert.deepEqual(by["조용한"].axes, ["감정", "에너지"], "물려받은 축이 있으면 그대로");
});

test("축마다 검색어 수 — 뺀 말은 안 세고, 여러 축이면 축마다 센다", () => {
  const { tally, noAxis } = photoAxisTally(mergePhotoTerms(E, T, AX), ["스타일", "색감", "감정", "에너지"]);
  assert.deepEqual([...tally], [["스타일", 2], ["색감", 1], ["감정", 1], ["에너지", 1]]);
  assert.equal(noAxis, 1, "야구장만 축이 없다 — 웨딩은 뺀 말이라 안 센다");
});

test("고유 지명은 빼고, 장소의 종류와 지명이 든 양식 말은 남긴다", () => {
  for (const w of ["성수 감성", "제주 감성", "한강뷰", "교토 감성", "뉴욕 감성", "해외 감성", "유럽 감성", "경복궁", "발리 감성", "용산역철길", "백빈건널목", "홍콩느낌"]) {
    assert.equal(isPlaceTerm(w), true, w);
  }
  for (const w of ["지하철", "영화관", "카페 감성", "루프탑 감성", "한옥 감성", "홍콩 영화 감성", "일본 영화 색감", "유럽풍", "프렌치 시크", "도시 감성"]) {
    assert.equal(isPlaceTerm(w), false, w);
  }
});

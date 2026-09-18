import assert from "node:assert/strict";
import test from "node:test";

import {
  filterPurposeAlbums,
  groupPurposeRows,
  reviewAlbumOptimistically,
  reviewPhotoOptimistically,
  applyAlbumPurposes,
  applyPhotoPurposes,
  clearPhotoPurposes,
  formatPurposePrice,
  summarizePurposeCounts,
  type AdminPurposeEvidence,
  type AdminPurposeRow,
} from "./photo-purpose-admin";

test("purpose counts separate portfolio assignments from photo exceptions and standalone photos", () => {
  const albums = groupPurposeRows([
    { ...rows[0], albumPurposes: ["wedding", "pet"], photoPurposes: ["wedding", "pet"] },
    { ...rows[1], albumPurposes: ["wedding", "pet"], photoPurposes: ["couple", "pet"] },
    rows[2],
    rows[3],
  ]);
  const summary = summarizePurposeCounts(albums);
  const count = (purpose: string) => summary.purposes.find((item) => item.purpose === purpose);
  assert.equal(summary.portfolioCount, 2);
  assert.equal(summary.photoCount, 4);
  assert.deepEqual(count("wedding"), { purpose: "wedding", portfolioCount: 1, photoCount: 1 });
  assert.deepEqual(count("pet"), { purpose: "pet", portfolioCount: 1, photoCount: 2 });
  assert.deepEqual(count("couple"), { purpose: "couple", portfolioCount: 0, photoCount: 1 });
  assert.deepEqual(count("personal"), { purpose: "personal", portfolioCount: 0, photoCount: 1 });
});

test("purpose counts follow saved portfolio changes and individual photo changes independently", () => {
  const albums = applyAlbumPurposes(groupPurposeRows(rows), "a1", ["event"]);
  const before = summarizePurposeCounts(albums);
  const after = summarizePurposeCounts(applyPhotoPurposes(albums, "a1", "p1", ["wedding", "pet"]));
  assert.deepEqual(before.purposes.find((item) => item.purpose === "event"), {
    purpose: "event", portfolioCount: 1, photoCount: 1,
  });
  assert.deepEqual(after.purposes.find((item) => item.purpose === "event"), {
    purpose: "event", portfolioCount: 1, photoCount: 0,
  });
  assert.deepEqual(after.purposes.find((item) => item.purpose === "pet"), {
    purpose: "pet", portfolioCount: 0, photoCount: 1,
  });
});

test("purpose counts include every category even when there are no photos", () => {
  const summary = summarizePurposeCounts([]);
  assert.equal(summary.portfolioCount, 0);
  assert.equal(summary.photoCount, 0);
  assert.deepEqual(summary.purposes.map((item) => item.purpose), [
    "personal", "couple", "friendship", "wedding", "pet", "commercial", "event",
  ]);
  assert.ok(summary.purposes.every((item) => item.portfolioCount === 0 && item.photoCount === 0));
});

test("purpose price labels preserve real prices including zero", () => {
  assert.equal(formatPurposePrice(120_000), "₩120,000");
  assert.equal(formatPurposePrice(0), "₩0");
});

test("missing or invalid purpose prices never become NaN or a false zero price", () => {
  for (const value of [undefined, null, NaN, Infinity, -1, "120000"]) {
    assert.equal(formatPurposePrice(value), null);
  }
});

test("grouping retains multiple purposes and migrates legacy singles", () => {
  const album = groupPurposeRows([{ ...rows[0], albumPurposes: ["wedding", "pet"], photoPurposes: ["wedding", "pet"] }])[0];
  assert.deepEqual(album.purposes, ["wedding", "pet"]);
  assert.deepEqual(album.photos[0].purposes, ["wedding", "pet"]);
  assert.deepEqual(groupPurposeRows(rows)[0].purposes, ["wedding"]);
});

test("portfolio application replaces the purpose set but protects photo exceptions", () => {
  const original = groupPurposeRows(rows);
  const album = applyAlbumPurposes(original, "a1", ["wedding", "pet"])[0];
  assert.deepEqual(album.purposes, ["wedding", "pet"]);
  assert.deepEqual(album.photos.map(photo => photo.purposes), [["wedding", "pet"], ["personal"]]);
  assert.equal(album.evidence, null);
  assert.equal(album.reviewed, true);
  assert.deepEqual(original[0].purposes, ["wedding"]);
});

test("photo application retains the portfolio set and clearing inherits every purpose", () => {
  const original = applyAlbumPurposes(groupPurposeRows(rows), "a1", ["wedding", "pet"]);
  const overridden = applyPhotoPurposes(original, "a1", "p1", ["couple", "pet"]);
  assert.deepEqual(overridden[0].purposes, ["wedding", "pet"]);
  assert.deepEqual(overridden[0].photos[0].purposes, ["couple", "pet"]);
  assert.equal(overridden[0].overrideCount, 2);
  const restored = clearPhotoPurposes(overridden, "a1", "p1");
  assert.deepEqual(restored[0].photos[0].purposes, ["wedding", "pet"]);
  assert.equal(restored[0].photos[0].overridden, false);
  assert.deepEqual(overridden[0].photos[0].purposes, ["couple", "pet"]);
});

test("standalone photos expose all saved purposes and clear to unclassified", () => {
  const changed = applyPhotoPurposes(groupPurposeRows(rows), "photo:solo", "solo", ["wedding", "pet"]);
  const standalone = changed.find(album => album.id === "photo:solo")!;
  assert.deepEqual(standalone.purposes, ["wedding", "pet"]);
  const reset = clearPhotoPurposes(changed, "photo:solo", "solo").find(album => album.id === "photo:solo")!;
  assert.deepEqual(reset.purposes, []);
  assert.deepEqual(reset.photos[0].purposes, []);
  assert.equal(reset.purpose, null);
  assert.equal(reset.reviewed, false);
});

test("purpose filter finds secondary purposes and photo-only exceptions", () => {
  const grouped = groupPurposeRows(rows);
  const albums = applyPhotoPurposes(grouped, "a1", "p1", ["wedding", "pet"]);
  assert.deepEqual(filterPurposeAlbums(albums, { state: "all", purpose: "pet", photographer: "" }).map(album => album.id), ["a1"]);
  const applied = applyAlbumPurposes(grouped, "a1", ["wedding", "pet"]);
  assert.deepEqual(filterPurposeAlbums(applied, { state: "all", purpose: "pet", photographer: "" }).map(album => album.id), ["a1"]);
});

const rows: AdminPurposeRow[] = [
  {
    photoId: "p1",
    albumId: "a1",
    albumTitle: "봄 웨딩",
    albumDescription: "한강",
    albumCreatedAt: "2026-09-14T10:00:00.000Z",
    photographerId: "ph1",
    photographerName: "가 작가",
    thumbUrl: "/p1.jpg",
    srcUrl: "/p1-full.jpg",
    photoPurpose: "wedding",
    photoConfidence: 0.94,
    photoSource: "siglip",
    photoReviewed: false,
    photoOverridden: false,
    albumPurpose: "wedding",
    albumConfidence: 0.94,
    albumSource: "siglip",
    albumReviewed: false,
  },
  {
    photoId: "p2",
    albumId: "a1",
    albumTitle: "봄 웨딩",
    albumDescription: "한강",
    albumCreatedAt: "2026-09-14T10:00:00.000Z",
    photographerId: "ph1",
    photographerName: "가 작가",
    thumbUrl: "/p2.jpg",
    srcUrl: "/p2-full.jpg",
    photoPurpose: "personal",
    photoConfidence: 1,
    photoSource: "manual",
    photoReviewed: true,
    photoOverridden: true,
    albumPurpose: "wedding",
    albumConfidence: 0.94,
    albumSource: "siglip",
    albumReviewed: false,
  },
  {
    photoId: "p3",
    albumId: "a2",
    albumTitle: null,
    albumDescription: null,
    albumCreatedAt: "2026-09-13T10:00:00.000Z",
    photographerId: "ph2",
    photographerName: "나 작가",
    thumbUrl: null,
    srcUrl: "/p3-full.jpg",
    photoPurpose: null,
    photoConfidence: 0.45,
    photoSource: "siglip",
    photoReviewed: false,
    photoOverridden: false,
    albumPurpose: null,
    albumConfidence: 0.45,
    albumSource: "siglip",
    albumReviewed: false,
  },
  {
    photoId: "solo",
    albumId: null,
    albumTitle: null,
    albumDescription: null,
    albumCreatedAt: "2026-09-12T10:00:00.000Z",
    photographerId: "ph2",
    photographerName: "나 작가",
    thumbUrl: "/solo.jpg",
    srcUrl: "/solo-full.jpg",
    photoPurpose: "personal",
    photoConfidence: 1,
    photoSource: "manual",
    photoReviewed: true,
    photoOverridden: true,
    albumPurpose: null,
    albumConfidence: null,
    albumSource: null,
    albumReviewed: false,
  },
];

test("rows are grouped into portfolios with stable newest-first ordering", () => {
  const albums = groupPurposeRows(rows);
  assert.deepEqual(albums.map((album) => album.id), ["a1", "a2", "photo:solo"]);
  assert.deepEqual(albums[0].photos.map((photo) => photo.id), ["p1", "p2"]);
});

test("unclassified filter includes albums with null purpose", () => {
  const albums = groupPurposeRows(rows);
  assert.deepEqual(
    filterPurposeAlbums(albums, {
      state: "unclassified",
      purpose: "all",
      photographer: "",
    }).map((album) => album.id),
    ["a2"],
  );
});

test("photo overrides remain visible and counted inside their portfolio", () => {
  const album = groupPurposeRows(rows).find((item) => item.id === "a1")!;
  assert.equal(album.photos.filter((photo) => photo.overridden).length, 1);
  assert.equal(album.overrideCount, 1);
});

test("low-confidence filter only includes automatic portfolios below threshold", () => {
  const albums = groupPurposeRows(rows);
  assert.deepEqual(
    filterPurposeAlbums(albums, {
      state: "low-confidence",
      purpose: "all",
      photographer: "",
    }).map((album) => album.id),
    ["a2"],
  );
});

test("low-confidence excludes reviewed portfolios for every automatic source", () => {
  for (const source of ["siglip", "text", "hybrid"] as const) {
    const albums = groupPurposeRows([
      { ...rows[0], albumSource: source, albumConfidence: 0.6, albumReviewed: true },
      { ...rows[2], albumSource: source, albumConfidence: 0.6 },
    ]);
    assert.deepEqual(
      filterPurposeAlbums(albums, { state: "low-confidence", purpose: "all", photographer: "" })
        .map((album) => album.id),
      ["a2"],
      source,
    );
  }
});

test("reviewing a low-confidence portfolio immediately removes it from the review queue", () => {
  const albums = groupPurposeRows([{ ...rows[0], albumConfidence: 0.6 }]);
  const filter = { state: "low-confidence", purpose: "all", photographer: "" } as const;
  assert.equal(filterPurposeAlbums(albums, filter).length, 1);
  const reviewed = reviewAlbumOptimistically(albums, "a1");
  assert.equal(filterPurposeAlbums(reviewed, filter).length, 0);
  assert.equal(reviewed[0].confidence, 0.6);
  assert.equal(albums[0].reviewed, false);
});

test("purpose and photographer filters compose", () => {
  const albums = groupPurposeRows(rows);
  assert.deepEqual(
    filterPurposeAlbums(albums, {
      state: "all",
      purpose: "wedding",
      photographer: "가",
    }).map((album) => album.id),
    ["a1"],
  );
});

test("reviewed filter includes manually reviewed standalone photos", () => {
  const albums = groupPurposeRows(rows);
  assert.deepEqual(
    filterPurposeAlbums(albums, {
      state: "reviewed",
      purpose: "all",
      photographer: "",
    }).map((album) => album.id),
    ["photo:solo"],
  );
});

test("portfolio review marks the portfolio and every included photo reviewed without changing purposes", () => {
  const albums = reviewAlbumOptimistically(groupPurposeRows(rows), "a1");
  const album = albums.find((item) => item.id === "a1")!;

  assert.equal(album.reviewed, true);
  assert.deepEqual(
    album.photos.map((photo) => ({ id: photo.id, purpose: photo.purpose, reviewed: photo.reviewed })),
    [
      { id: "p1", purpose: "wedding", reviewed: true },
      { id: "p2", purpose: "personal", reviewed: true },
    ],
  );
});

test("individual photo review marks only the selected photo and leaves its portfolio unreviewed", () => {
  const unreviewedRows = rows.map((row) =>
    row.photoId === "p2" ? { ...row, photoReviewed: false } : row,
  );
  const albums = reviewPhotoOptimistically(groupPurposeRows(unreviewedRows), "a1", "p1");
  const album = albums.find((item) => item.id === "a1")!;

  assert.equal(album.reviewed, false);
  assert.deepEqual(
    album.photos.map((photo) => ({ id: photo.id, reviewed: photo.reviewed })),
    [
      { id: "p1", reviewed: true },
      { id: "p2", reviewed: false },
    ],
  );
});

test("individual review of a standalone photo also reviews its standalone portfolio wrapper", () => {
  const albums = reviewPhotoOptimistically(groupPurposeRows(rows), "photo:solo", "solo");
  const standalone = albums.find((item) => item.id === "photo:solo")!;

  assert.equal(standalone.reviewed, true);
  assert.equal(standalone.photos[0].reviewed, true);
});

test("automatic filter includes text and hybrid classification sources", () => {
  const automaticRows = [
    {
      ...rows[0],
      photoSource: "text" as const,
      albumSource: "text" as const,
    },
    {
      ...rows[2],
      photoId: "p4",
      albumId: "a3",
      photoPurpose: "couple" as const,
      albumPurpose: "couple" as const,
      photoSource: "hybrid" as const,
      albumSource: "hybrid" as const,
    },
  ];
  assert.deepEqual(
    filterPurposeAlbums(groupPurposeRows(automaticRows), {
      state: "auto",
      purpose: "all",
      photographer: "",
    }).map((album) => album.id),
    ["a1", "a3"],
  );
});

test("grouping keeps evidence and the package actually linked to the album", () => {
  const evidence: AdminPurposeEvidence = {
    text_candidates: ["couple"],
    text_matches: [{ source: "album_description", purpose: "couple", phrase: "커플 스냅" }],
    text_conflict: false,
    image_purpose: "friendship",
    image_confidence: 0.43,
  };
  const album = groupPurposeRows([
    {
      ...rows[0],
      albumSource: "text" as const,
      albumEvidence: evidence,
      packageId: "pkg-couple",
      packageName: "커플 야외",
      packageDescription: "커플 스냅 상품",
      photoPriceKrw: 90_000,
      availablePackages: [
        { id: "pkg-couple", name: "커플 야외", description: "커플 스냅 상품", priceKrw: 90_000 },
      ],
    },
  ])[0];

  assert.equal(album.source, "text");
  assert.deepEqual(album.evidence, evidence);
  assert.equal(album.packageId, "pkg-couple");
  assert.equal(album.packageName, "커플 야외");
  assert.deepEqual(album.availablePackages.map((item) => item.id), ["pkg-couple"]);
  assert.equal(album.photos[0].priceKrw, 90_000);
  assert.equal(album.availablePackages[0].priceKrw, 90_000);
});

test("legacy photo prices survive grouping without inventing a package link", () => {
  const album = groupPurposeRows([
    { ...rows[0], photoPriceKrw: 120_000 },
    { ...rows[1], photoPriceKrw: 90_000 },
  ])[0];
  assert.equal(album.packageId, null);
  assert.deepEqual(album.photos.map((photo) => photo.priceKrw), [120_000, 90_000]);
});

test("admin package assignments are internal fallbacks and photographer assignments take priority", () => {
  const availablePackages = [
    { id: "admin-pkg", name: "관리자 상품", description: "내부 지정", priceKrw: 90_000 },
    { id: "author-pkg", name: "작가 상품", description: "직접 지정", priceKrw: 120_000 },
  ];
  const [internal] = groupPurposeRows([{ ...rows[0], adminPackageId: "admin-pkg", availablePackages }]);
  assert.equal(internal.packageId, "admin-pkg");
  assert.equal(internal.packageSource, "admin");
  assert.equal(internal.packageName, "관리자 상품");
  assert.equal(filterPurposeAlbums([internal], { state: "package-unlinked", purpose: "all", photographer: "" }).length, 0);

  const [author] = groupPurposeRows([{
    ...rows[0], packageId: "author-pkg", adminPackageId: "admin-pkg", availablePackages,
  }]);
  assert.equal(author.packageId, "author-pkg");
  assert.equal(author.packageSource, "photographer");
  assert.equal(author.packageName, "작가 상품");
  assert.equal(author.packageDescription, "직접 지정");
  assert.equal(groupPurposeRows([rows[0]])[0].packageSource, null);
});

test("text-conflict filter isolates unresolved metadata disagreements", () => {
  const conflictRows = rows.map((row) =>
    row.albumId === "a2"
      ? {
          ...row,
          albumEvidence: {
            text_conflict: true,
            text_candidates: ["couple", "friendship"],
          } satisfies AdminPurposeEvidence,
        }
      : row,
  );
  assert.deepEqual(
    filterPurposeAlbums(groupPurposeRows(conflictRows), {
      state: "text-conflict",
      purpose: "all",
      photographer: "",
    }).map((album) => album.id),
    ["a2"],
  );
});

test("package-unlinked filter only includes album portfolios without a package id", () => {
  const packageRows = rows.map((row) =>
    row.albumId === "a1" ? { ...row, packageId: "pkg" } : row,
  );
  assert.deepEqual(
    filterPurposeAlbums(groupPurposeRows(packageRows), {
      state: "package-unlinked",
      purpose: "all",
      photographer: "",
    }).map((album) => album.id),
    ["a2"],
  );
});

// ── 개인 목적 안의 성별 ──────────────────────────────────────────────────
const personalRows: AdminPurposeRow[] = [
  { ...rows[0], albumId: "g1", albumPurposes: ["personal"], photoPurposes: ["personal"],
    albumGender: "female", albumGenderSource: "auto", photoGender: "female", photoGenderSource: "auto",
    photoOverridden: false },
  { ...rows[0], photoId: "g1-p2", albumId: "g1", albumPurposes: ["personal"], photoPurposes: ["personal"],
    albumGender: "female", albumGenderSource: "auto", photoGender: "male", photoGenderSource: "manual",
    photoOverridden: true },
];

test("성별은 포트폴리오와 사진에 따로 담긴다", () => {
  const [album] = groupPurposeRows(personalRows);
  assert.equal(album.gender, "female");
  assert.equal(album.genderSource, "auto");
  assert.deepEqual(album.photos.map((p) => p.gender), ["female", "male"]);
});

test("포트폴리오 적용은 예외 사진을 빼고 성별을 확정한다", () => {
  const [album] = applyAlbumPurposes(groupPurposeRows(personalRows), "g1", ["personal"], "male");
  assert.equal(album.gender, "male");
  assert.equal(album.genderSource, "manual");
  assert.deepEqual(album.photos.map((p) => [p.gender, p.genderSource]), [["male", "manual"], ["male", "manual"]]);
});

test("개인을 빼면 성별도 사라진다", () => {
  const [album] = applyAlbumPurposes(groupPurposeRows(personalRows), "g1", ["couple"], "female");
  assert.equal(album.gender, null);
  assert.equal(album.photos[0].gender, null);
});

test("성별을 안 넘기면(DB 준비 전) 지금 성별과 출처를 둔다", () => {
  const [album] = applyAlbumPurposes(groupPurposeRows(personalRows), "g1", ["personal", "pet"]);
  assert.equal(album.gender, "female");
  assert.equal(album.genderSource, "auto");
});

test("포트폴리오 검수는 자동 초안 성별을 확정하고 예외 사진은 그대로 둔다", () => {
  const [album] = reviewAlbumOptimistically(groupPurposeRows(personalRows), "g1");
  assert.equal(album.genderSource, "manual");
  assert.equal(album.photos[0].genderSource, "manual");
  assert.equal(album.photos[1].gender, "male");
});

test("예외를 풀면 포트폴리오 성별을 물려받는다", () => {
  const [album] = clearPhotoPurposes(groupPurposeRows(personalRows), "g1", "g1-p2");
  assert.equal(album.photos[1].gender, "female");
});

test("성별 필터와 집계", () => {
  const albums = [
    ...groupPurposeRows(personalRows),
    ...groupPurposeRows([{ ...rows[0], albumId: "g2", albumPurposes: ["personal"], photoPurposes: ["personal"] }]),
  ];
  const ids = (state: "gender-missing" | "gender-auto") =>
    filterPurposeAlbums(albums, { state, purpose: "all", photographer: "" }).map((a) => a.id);
  assert.deepEqual(ids("gender-missing"), ["g2"]);
  assert.deepEqual(ids("gender-auto"), ["g1"]);
  const summary = summarizePurposeCounts(albums);
  assert.deepEqual(summary.genders, [
    { gender: "female", portfolioCount: 1, photoCount: 1 },
    { gender: "male", portfolioCount: 0, photoCount: 1 },
  ]);
});

test("목적 필터로 개인 안의 성별만 볼 수 있다", () => {
  const albums = [
    ...groupPurposeRows(personalRows),
    ...groupPurposeRows([{ ...rows[0], albumId: "g2", albumPurposes: ["personal"], photoPurposes: ["personal"] }]),
  ];
  const ids = (gender: "female" | "male") =>
    filterPurposeAlbums(albums, { state: "all", purpose: "personal", gender, photographer: "" }).map((a) => a.id);
  assert.deepEqual(ids("female"), ["g1"]);
  assert.deepEqual(ids("male"), ["g1"], "여성 포트폴리오 안의 남성 예외 사진도 찾는다");
});

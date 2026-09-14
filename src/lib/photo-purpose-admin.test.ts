import assert from "node:assert/strict";
import test from "node:test";

import {
  filterPurposeAlbums,
  groupPurposeRows,
  reviewAlbumOptimistically,
  reviewPhotoOptimistically,
  type AdminPurposeEvidence,
  type AdminPurposeRow,
} from "./photo-purpose-admin";

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
      availablePackages: [
        { id: "pkg-couple", name: "커플 야외", description: "커플 스냅 상품" },
      ],
    },
  ])[0];

  assert.equal(album.source, "text");
  assert.deepEqual(album.evidence, evidence);
  assert.equal(album.packageId, "pkg-couple");
  assert.equal(album.packageName, "커플 야외");
  assert.deepEqual(album.availablePackages.map((item) => item.id), ["pkg-couple"]);
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

import assert from "node:assert/strict";
import test from "node:test";

import {
  filterPurposeAlbums,
  groupPurposeRows,
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

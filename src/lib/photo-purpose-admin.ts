import type { PurposeKey } from "./photo-purpose";

export type PurposeSource = "siglip" | "text" | "hybrid" | "manual" | null;

export type AdminPurposeEvidence = {
  text_candidates?: PurposeKey[];
  text_matches?: Array<{ source: string; purpose: PurposeKey; phrase: string }>;
  text_conflict?: boolean;
  image_purpose?: PurposeKey | null;
  image_confidence?: number | null;
  image_scores?: Partial<Record<PurposeKey, number>>;
};

export type AdminPackageOption = {
  id: string;
  name: string;
  description: string;
};

const AUTOMATIC_PURPOSE_SOURCES = new Set<PurposeSource>(["siglip", "text", "hybrid"]);

export type AdminPurposeRow = {
  photoId: string;
  albumId: string | null;
  albumTitle: string | null;
  albumDescription: string | null;
  albumCreatedAt: string;
  photographerId: string;
  photographerName: string | null;
  thumbUrl: string | null;
  srcUrl: string;
  photoPurpose: PurposeKey | null;
  photoConfidence: number | null;
  photoSource: PurposeSource;
  photoReviewed: boolean;
  photoOverridden: boolean;
  photoTitle?: string | null;
  photoCaption?: string | null;
  photoEvidence?: AdminPurposeEvidence | null;
  albumPurpose: PurposeKey | null;
  albumConfidence: number | null;
  albumSource: PurposeSource;
  albumReviewed: boolean;
  albumEvidence?: AdminPurposeEvidence | null;
  packageId?: string | null;
  packageName?: string | null;
  packageDescription?: string | null;
  availablePackages?: AdminPackageOption[];
};

export type AdminPurposePhoto = {
  id: string;
  thumbUrl: string | null;
  srcUrl: string;
  purpose: PurposeKey | null;
  confidence: number | null;
  source: PurposeSource;
  reviewed: boolean;
  overridden: boolean;
  title: string | null;
  caption: string | null;
  evidence: AdminPurposeEvidence | null;
};

export type AdminPurposeAlbum = {
  id: string;
  albumId: string | null;
  title: string;
  description: string | null;
  createdAt: string;
  photographerId: string;
  photographerName: string;
  purpose: PurposeKey | null;
  confidence: number | null;
  source: PurposeSource;
  reviewed: boolean;
  overrideCount: number;
  evidence: AdminPurposeEvidence | null;
  packageId: string | null;
  packageName: string | null;
  packageDescription: string | null;
  availablePackages: AdminPackageOption[];
  photos: AdminPurposePhoto[];
};

export type PurposeFilter = {
  state:
    | "all"
    | "unclassified"
    | "auto"
    | "reviewed"
    | "low-confidence"
    | "text-conflict"
    | "package-unlinked";
  purpose: PurposeKey | "all";
  photographer: string;
};

export const LOW_CONFIDENCE_THRESHOLD = 0.8;

function toPhoto(row: AdminPurposeRow): AdminPurposePhoto {
  return {
    id: row.photoId,
    thumbUrl: row.thumbUrl,
    srcUrl: row.srcUrl,
    purpose: row.photoPurpose,
    confidence: row.photoConfidence,
    source: row.photoSource,
    reviewed: row.photoReviewed,
    overridden: row.photoOverridden,
    title: row.photoTitle ?? null,
    caption: row.photoCaption ?? null,
    evidence: row.photoEvidence ?? null,
  };
}

export function groupPurposeRows(rows: AdminPurposeRow[]): AdminPurposeAlbum[] {
  const groups = new Map<string, AdminPurposeAlbum>();

  for (const row of rows) {
    const id = row.albumId ?? `photo:${row.photoId}`;
    const standalone = row.albumId === null;
    const existing = groups.get(id);
    if (existing) {
      existing.photos.push(toPhoto(row));
      if (row.photoOverridden) existing.overrideCount += 1;
      continue;
    }

    groups.set(id, {
      id,
      albumId: row.albumId,
      title: row.albumTitle?.trim() || (standalone ? "단독 사진" : "제목 없는 포트폴리오"),
      description: row.albumDescription,
      createdAt: row.albumCreatedAt,
      photographerId: row.photographerId,
      photographerName: row.photographerName?.trim() || "이름 없는 작가",
      purpose: standalone ? row.photoPurpose : row.albumPurpose,
      confidence: standalone ? row.photoConfidence : row.albumConfidence,
      source: standalone ? row.photoSource : row.albumSource,
      reviewed: standalone ? row.photoReviewed : row.albumReviewed,
      overrideCount: row.photoOverridden ? 1 : 0,
      evidence: standalone ? row.photoEvidence ?? null : row.albumEvidence ?? null,
      packageId: row.packageId ?? null,
      packageName: row.packageName ?? null,
      packageDescription: row.packageDescription ?? null,
      availablePackages: row.availablePackages ?? [],
      photos: [toPhoto(row)],
    });
  }

  return [...groups.values()].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
  );
}

export function reviewAlbumOptimistically(
  albums: AdminPurposeAlbum[],
  groupId: string,
): AdminPurposeAlbum[] {
  return albums.map((album) =>
    album.id !== groupId
      ? album
      : {
          ...album,
          reviewed: true,
          photos: album.photos.map((photo) => ({ ...photo, reviewed: true })),
        },
  );
}

export function reviewPhotoOptimistically(
  albums: AdminPurposeAlbum[],
  groupId: string,
  photoId: string,
): AdminPurposeAlbum[] {
  return albums.map((album) =>
    album.id !== groupId
      ? album
      : {
          ...album,
          ...(album.albumId === null ? { reviewed: true } : {}),
          photos: album.photos.map((photo) =>
            photo.id === photoId ? { ...photo, reviewed: true } : photo,
          ),
        },
  );
}

export function filterPurposeAlbums(
  albums: AdminPurposeAlbum[],
  filter: PurposeFilter,
): AdminPurposeAlbum[] {
  const photographer = filter.photographer.trim().toLocaleLowerCase("ko-KR");

  return albums.filter((album) => {
    const stateMatches =
      filter.state === "all" ||
      (filter.state === "unclassified" && album.purpose === null) ||
      (filter.state === "auto" && AUTOMATIC_PURPOSE_SOURCES.has(album.source) && album.purpose !== null) ||
      (filter.state === "reviewed" && album.reviewed) ||
      (filter.state === "text-conflict" && album.evidence?.text_conflict === true) ||
      (filter.state === "package-unlinked" && album.albumId !== null && album.packageId === null) ||
      (filter.state === "low-confidence" &&
        AUTOMATIC_PURPOSE_SOURCES.has(album.source) &&
        album.confidence !== null &&
        album.confidence < LOW_CONFIDENCE_THRESHOLD);
    const purposeMatches = filter.purpose === "all" || album.purpose === filter.purpose;
    const photographerMatches =
      !photographer || album.photographerName.toLocaleLowerCase("ko-KR").includes(photographer);
    return stateMatches && purposeMatches && photographerMatches;
  });
}

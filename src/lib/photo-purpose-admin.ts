import { normalizePurposes, PURPOSE_OPTIONS, type PurposeKey } from "./photo-purpose";

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
  priceKrw: number;
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
  photoPurposes?: PurposeKey[] | null;
  photoConfidence: number | null;
  photoSource: PurposeSource;
  photoReviewed: boolean;
  photoOverridden: boolean;
  photoTitle?: string | null;
  photoCaption?: string | null;
  photoPriceKrw?: number | null;
  photoEvidence?: AdminPurposeEvidence | null;
  albumPurpose: PurposeKey | null;
  albumPurposes?: PurposeKey[] | null;
  albumConfidence: number | null;
  albumSource: PurposeSource;
  albumReviewed: boolean;
  albumEvidence?: AdminPurposeEvidence | null;
  packageId?: string | null;
  adminPackageId?: string | null;
  packageName?: string | null;
  packageDescription?: string | null;
  availablePackages?: AdminPackageOption[];
};

export type AdminPurposePhoto = {
  id: string;
  thumbUrl: string | null;
  srcUrl: string;
  purpose: PurposeKey | null;
  purposes: PurposeKey[];
  confidence: number | null;
  source: PurposeSource;
  reviewed: boolean;
  overridden: boolean;
  title: string | null;
  caption: string | null;
  priceKrw: number | null;
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
  purposes: PurposeKey[];
  confidence: number | null;
  source: PurposeSource;
  reviewed: boolean;
  overrideCount: number;
  evidence: AdminPurposeEvidence | null;
  packageId: string | null;
  packageSource: "photographer" | "admin" | null;
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
    | "unreviewed"
    | "reviewed"
    | "low-confidence"
    | "text-conflict"
    | "package-linked"
    | "package-unlinked";
  purpose: PurposeKey | "all";
  photographer: string;
};

export const LOW_CONFIDENCE_THRESHOLD = 0.8;

const priceFormatter = new Intl.NumberFormat("ko-KR");

export function formatPurposePrice(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return `₩${priceFormatter.format(value)}`;
}

function toPhoto(row: AdminPurposeRow): AdminPurposePhoto {
  return {
    id: row.photoId,
    thumbUrl: row.thumbUrl,
    srcUrl: row.srcUrl,
    purpose: row.photoPurpose,
    purposes: normalizePurposes(row.photoPurposes, row.photoPurpose),
    confidence: row.photoConfidence,
    source: row.photoSource,
    reviewed: row.photoReviewed,
    overridden: row.photoOverridden,
    title: row.photoTitle ?? null,
    caption: row.photoCaption ?? null,
    priceKrw: row.photoPriceKrw ?? null,
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

    const packageId = row.packageId ?? row.adminPackageId ?? null;
    const linkedPackage = row.availablePackages?.find((item) => item.id === packageId);
    groups.set(id, {
      id,
      albumId: row.albumId,
      title: row.albumTitle?.trim() || (standalone ? "단독 사진" : "제목 없는 포트폴리오"),
      description: row.albumDescription,
      createdAt: row.albumCreatedAt,
      photographerId: row.photographerId,
      photographerName: row.photographerName?.trim() || "이름 없는 작가",
      purpose: standalone ? row.photoPurpose : row.albumPurpose,
      purposes: standalone
        ? normalizePurposes(row.photoPurposes, row.photoPurpose)
        : normalizePurposes(row.albumPurposes, row.albumPurpose),
      confidence: standalone ? row.photoConfidence : row.albumConfidence,
      source: standalone ? row.photoSource : row.albumSource,
      reviewed: standalone ? row.photoReviewed : row.albumReviewed,
      overrideCount: row.photoOverridden ? 1 : 0,
      evidence: standalone ? row.photoEvidence ?? null : row.albumEvidence ?? null,
      packageId,
      packageSource: row.packageId ? "photographer" : row.adminPackageId ? "admin" : null,
      packageName: linkedPackage?.name ?? row.packageName ?? null,
      packageDescription: linkedPackage?.description ?? row.packageDescription ?? null,
      availablePackages: row.availablePackages ?? [],
      photos: [toPhoto(row)],
    });
  }

  return [...groups.values()].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
  );
}

export function summarizePurposeCounts(albums: readonly AdminPurposeAlbum[]) {
  const purposes = PURPOSE_OPTIONS.map(({ key }) => ({
    purpose: key,
    portfolioCount: 0,
    photoCount: 0,
  }));
  const byPurpose = new Map(purposes.map((item) => [item.purpose, item]));
  let portfolioCount = 0;
  let photoCount = 0;

  for (const album of albums) {
    if (album.albumId !== null) {
      portfolioCount += 1;
      for (const purpose of new Set(album.purposes)) {
        const count = byPurpose.get(purpose);
        if (count) count.portfolioCount += 1;
      }
    }
    for (const photo of album.photos) {
      photoCount += 1;
      for (const purpose of new Set(photo.purposes)) {
        const count = byPurpose.get(purpose);
        if (count) count.photoCount += 1;
      }
    }
  }

  return { portfolioCount, photoCount, purposes };
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

function manualPurposes(purposes: readonly PurposeKey[]) {
  return {
    purposes: [...purposes], purpose: purposes[0] ?? null,
    confidence: 1, source: "manual" as const, reviewed: true, evidence: null,
  };
}

export function applyAlbumPurposes(albums: AdminPurposeAlbum[], groupId: string, purposes: readonly PurposeKey[]): AdminPurposeAlbum[] {
  return albums.map((album) => album.id !== groupId ? album : {
    ...album,
    ...manualPurposes(purposes),
    photos: album.photos.map((photo) => photo.overridden ? photo : { ...photo, ...manualPurposes(purposes) }),
  });
}

export function applyPhotoPurposes(albums: AdminPurposeAlbum[], groupId: string, photoId: string, purposes: readonly PurposeKey[]): AdminPurposeAlbum[] {
  return albums.map((album) => {
    if (album.id !== groupId) return album;
    const photos = album.photos.map((photo) => photo.id !== photoId ? photo : {
      ...photo, ...manualPurposes(purposes), overridden: true,
    });
    return {
      ...album, ...(album.albumId === null ? manualPurposes(purposes) : {}), photos,
      overrideCount: photos.filter((photo) => photo.overridden).length,
    };
  });
}

export function clearPhotoPurposes(albums: AdminPurposeAlbum[], groupId: string, photoId: string): AdminPurposeAlbum[] {
  return albums.map((album) => {
    if (album.id !== groupId) return album;
    const inherited = album.albumId === null
      ? { purposes: [], purpose: null, confidence: null, source: null, reviewed: false, evidence: null }
      : { purposes: [...album.purposes], purpose: album.purpose, confidence: album.confidence,
          source: album.source, reviewed: album.reviewed, evidence: album.evidence };
    const photos = album.photos.map((photo) => photo.id !== photoId ? photo : { ...photo, ...inherited, overridden: false });
    return {
      ...album, ...(album.albumId === null ? inherited : {}), photos,
      overrideCount: photos.filter((photo) => photo.overridden).length,
    };
  });
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
      (filter.state === "unclassified" && album.purposes.length === 0) ||
      (filter.state === "auto" && AUTOMATIC_PURPOSE_SOURCES.has(album.source) && album.purposes.length > 0) ||
      (filter.state === "unreviewed" && !album.reviewed) ||
      (filter.state === "reviewed" && album.reviewed) ||
      (filter.state === "text-conflict" && album.evidence?.text_conflict === true) ||
      (filter.state === "package-linked" && album.albumId !== null && album.packageId !== null) ||
      (filter.state === "package-unlinked" && album.albumId !== null && album.packageId === null) ||
      (filter.state === "low-confidence" &&
        !album.reviewed &&
        AUTOMATIC_PURPOSE_SOURCES.has(album.source) &&
        album.confidence !== null &&
        album.confidence < LOW_CONFIDENCE_THRESHOLD);
    const purposeMatches = filter.purpose === "all" || album.purposes.includes(filter.purpose) ||
      album.photos.some((photo) => photo.purposes.includes(filter.purpose as PurposeKey));
    const photographerMatches =
      !photographer || album.photographerName.toLocaleLowerCase("ko-KR").includes(photographer);
    return stateMatches && purposeMatches && photographerMatches;
  });
}

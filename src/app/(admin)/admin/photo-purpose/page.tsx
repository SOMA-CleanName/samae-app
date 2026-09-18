import { isPurposeGender, isPurposeKey, normalizePurposes, type GenderSource } from "@/lib/photo-purpose";
import {
  groupPurposeRows,
  type AdminPurposeRow,
  type AdminPurposeEvidence,
  type PurposeSource,
} from "@/lib/photo-purpose-admin";
import { createAdminClient } from "@/lib/supabase/admin";

import { PhotoPurposeWorkspace } from "./PhotoPurposeWorkspace";

export const dynamic = "force-dynamic";

type DatabaseRow = {
  id: string;
  album_id: string | null;
  thumb_url: string | null;
  src_url: string;
  created_at: string;
  admin_purpose: string | null;
  admin_purposes?: string[];
  admin_purpose_confidence: number | null;
  admin_purpose_source: string | null;
  admin_purpose_reviewed: boolean;
  admin_purpose_overridden: boolean;
  title: string | null;
  caption: string | null;
  price_krw: number | null;
  admin_purpose_evidence: unknown;
  admin_purpose_gender?: string | null;
  admin_purpose_gender_source?: string | null;
  admin_purpose_details?: string[] | null;
  admin_purpose_details_source?: string | null;
  album: {
    id: string;
    title: string | null;
    description: string | null;
    created_at: string;
    admin_purpose: string | null;
    admin_purposes?: string[];
    admin_purpose_confidence: number | null;
    admin_purpose_source: string | null;
    admin_purpose_reviewed: boolean;
    package_id: string | null;
    admin_package: { package_id: string } | null;
    admin_purpose_evidence: unknown;
    admin_purpose_gender?: string | null;
    admin_purpose_gender_source?: string | null;
    admin_purpose_details?: string[] | null;
    admin_purpose_details_source?: string | null;
  } | null;
  photographer: {
    id: string;
    display_name: string | null;
  } | null;
};

function purpose(value: string | null) {
  return isPurposeKey(value) ? value : null;
}

function source(value: string | null): PurposeSource {
  return value === "siglip" || value === "text" || value === "hybrid" || value === "manual"
    ? value
    : null;
}

function gender(value: string | null | undefined) {
  return isPurposeGender(value) ? value : null;
}

function genderSource(value: string | null | undefined): GenderSource {
  return value === "auto" || value === "manual" ? value : null;
}

function evidence(value: unknown): AdminPurposeEvidence | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AdminPurposeEvidence)
    : null;
}

async function fetchPurposeRows(): Promise<{
  rows: AdminPurposeRow[];
  multiplePurposesReady: boolean;
  genderReady: boolean;
  detailsReady: boolean;
}> {
  const admin = createAdminClient();
  const pageSize = 1000;
  const databaseRows: DatabaseRow[] = [];
  let multiplePurposesReady = true;
  let genderReady = true;
  let detailsReady = true;

  for (let from = 0; ; from += pageSize) {
    const query = (multiple: boolean, withGender: boolean, withDetails: boolean) => admin
      .from("photos")
      .select(
        "id,album_id,thumb_url,src_url,title,caption,price_krw,created_at,admin_purpose,admin_purpose_confidence," +
          (multiple ? "admin_purposes," : "") +
          (withGender ? "admin_purpose_gender,admin_purpose_gender_source," : "") +
          (withDetails ? "admin_purpose_details,admin_purpose_details_source," : "") +
          "admin_purpose_source,admin_purpose_reviewed,admin_purpose_overridden,admin_purpose_evidence," +
          "album:albums(id,title,description,created_at,admin_purpose,admin_purpose_confidence," +
          (multiple ? "admin_purposes," : "") +
          (withGender ? "admin_purpose_gender,admin_purpose_gender_source," : "") +
          (withDetails ? "admin_purpose_details,admin_purpose_details_source," : "") +
          "admin_purpose_source,admin_purpose_reviewed,package_id,admin_package:album_admin_packages(package_id),admin_purpose_evidence)," +
          "photographer:photographers!photos_photographer_id_fkey(id,display_name)",
      )
      .eq("visibility", "published")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    let { data, error } = await query(multiplePurposesReady, genderReady, detailsReady);
    // 새 열 반영 전에도 검수 화면을 계속 쓸 수 있다 — 세부분류(0133), 성별(0132), 복수 목적(0116) 순으로 빼 본다.
    if (from === 0 && error?.code === "42703" && detailsReady) {
      detailsReady = false;
      ({ data, error } = await query(multiplePurposesReady, genderReady, false));
    }
    if (from === 0 && error?.code === "42703" && genderReady) {
      genderReady = false;
      ({ data, error } = await query(multiplePurposesReady, false, false));
    }
    if (from === 0 && error?.code === "42703") {
      multiplePurposesReady = false;
      ({ data, error } = await query(false, false, false));
    }

    if (error) throw new Error(`사진 목적 데이터를 불러오지 못했습니다: ${error.message}`);
    const batch = (data ?? []) as unknown as DatabaseRow[];
    databaseRows.push(...batch);
    if (batch.length < pageSize) break;
  }

  const photographerIds = [...new Set(
    databaseRows.map((row) => row.photographer?.id).filter((id): id is string => !!id),
  )];
  const { data: packageData, error: packageError } = photographerIds.length
    ? await admin
        .from("packages")
        .select("id,photographer_id,name,description,price_krw")
        .in("photographer_id", photographerIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  if (packageError) throw new Error(`패키지 데이터를 불러오지 못했습니다: ${packageError.message}`);
  const packages = (packageData ?? []) as Array<{
    id: string;
    photographer_id: string;
    name: string;
    description: string;
    price_krw: number;
  }>;
  const packageById = new Map(packages.map((item) => [item.id, item]));
  const packagesByPhotographer = new Map<string, typeof packages>();
  for (const item of packages) {
    const list = packagesByPhotographer.get(item.photographer_id) ?? [];
    list.push(item);
    packagesByPhotographer.set(item.photographer_id, list);
  }

  return { multiplePurposesReady, genderReady, detailsReady, rows: databaseRows.map((row) => {
      const effectivePackageId = row.album?.package_id ?? row.album?.admin_package?.package_id;
      const linkedPackage = effectivePackageId
        ? packageById.get(effectivePackageId) ?? null
        : null;
      const availablePackages = packagesByPhotographer.get(row.photographer?.id ?? "") ?? [];
      return {
        photoId: row.id,
        albumId: row.album_id,
        albumTitle: row.album?.title ?? null,
        albumDescription: row.album?.description ?? null,
        albumCreatedAt: row.album?.created_at ?? row.created_at,
        photographerId: row.photographer?.id ?? "unknown",
        photographerName: row.photographer?.display_name ?? null,
        thumbUrl: row.thumb_url,
        srcUrl: row.src_url,
        photoPurpose: purpose(row.admin_purpose),
        photoPurposes: normalizePurposes(row.admin_purposes, purpose(row.admin_purpose)),
        photoConfidence: row.admin_purpose_confidence,
        photoSource: source(row.admin_purpose_source),
        photoReviewed: row.admin_purpose_reviewed,
        photoOverridden: row.admin_purpose_overridden,
        photoTitle: row.title,
        photoCaption: row.caption,
        photoPriceKrw: row.price_krw,
        photoEvidence: evidence(row.admin_purpose_evidence),
        photoGender: gender(row.admin_purpose_gender),
        photoGenderSource: genderSource(row.admin_purpose_gender_source),
        photoDetails: row.admin_purpose_details ?? null,
        photoDetailsSource: genderSource(row.admin_purpose_details_source),
        albumPurpose: purpose(row.album?.admin_purpose ?? null),
        albumPurposes: normalizePurposes(row.album?.admin_purposes, purpose(row.album?.admin_purpose ?? null)),
        albumConfidence: row.album?.admin_purpose_confidence ?? null,
        albumSource: source(row.album?.admin_purpose_source ?? null),
        albumReviewed: row.album?.admin_purpose_reviewed ?? false,
        albumEvidence: evidence(row.album?.admin_purpose_evidence),
        albumGender: gender(row.album?.admin_purpose_gender),
        albumGenderSource: genderSource(row.album?.admin_purpose_gender_source),
        albumDetails: row.album?.admin_purpose_details ?? null,
        albumDetailsSource: genderSource(row.album?.admin_purpose_details_source),
        packageId: row.album?.package_id ?? null,
        adminPackageId: row.album?.admin_package?.package_id ?? null,
        packageName: linkedPackage?.name ?? null,
        packageDescription: linkedPackage?.description ?? null,
        availablePackages: availablePackages.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          priceKrw: item.price_krw,
        })),
      };
    }) };
}

export default async function AdminPhotoPurposePage() {
  const { rows, multiplePurposesReady, genderReady, detailsReady } = await fetchPurposeRows();
  const albums = groupPurposeRows(rows);

  return (
    <section aria-labelledby="purpose-heading">
      <div className="mb-5">
        <h2 id="purpose-heading" className="text-h2 font-semibold">목적</h2>
        <p className="mt-1 text-body-sm text-muted">
          포트폴리오에 해당하는 목적을 모두 선택하고, 다른 목적의 사진은 개별 예외로 분류하세요. 목적마다 세부분류를,
          개인 목적이면 성별(여성·남성)도 고릅니다. 이 값은 운영자 화면에서만 표시됩니다.
        </p>
      </div>
      <PhotoPurposeWorkspace
        initialAlbums={albums}
        multiplePurposesReady={multiplePurposesReady}
        genderReady={genderReady}
        detailsReady={detailsReady}
      />
    </section>
  );
}

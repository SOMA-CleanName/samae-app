import { isPurposeKey } from "@/lib/photo-purpose";
import {
  groupPurposeRows,
  type AdminPurposeRow,
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
  admin_purpose_confidence: number | null;
  admin_purpose_source: string | null;
  admin_purpose_reviewed: boolean;
  admin_purpose_overridden: boolean;
  album: {
    id: string;
    title: string | null;
    description: string | null;
    created_at: string;
    admin_purpose: string | null;
    admin_purpose_confidence: number | null;
    admin_purpose_source: string | null;
    admin_purpose_reviewed: boolean;
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
  return value === "siglip" || value === "manual" ? value : null;
}

async function fetchPurposeRows(): Promise<AdminPurposeRow[]> {
  const admin = createAdminClient();
  const pageSize = 1000;
  const rows: AdminPurposeRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("photos")
      .select(
        "id,album_id,thumb_url,src_url,created_at,admin_purpose,admin_purpose_confidence," +
          "admin_purpose_source,admin_purpose_reviewed,admin_purpose_overridden," +
          "album:albums(id,title,description,created_at,admin_purpose,admin_purpose_confidence," +
          "admin_purpose_source,admin_purpose_reviewed)," +
          "photographer:photographers!photos_photographer_id_fkey(id,display_name)",
      )
      .eq("visibility", "published")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`사진 목적 데이터를 불러오지 못했습니다: ${error.message}`);
    const batch = (data ?? []) as unknown as DatabaseRow[];
    for (const row of batch) {
      rows.push({
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
        photoConfidence: row.admin_purpose_confidence,
        photoSource: source(row.admin_purpose_source),
        photoReviewed: row.admin_purpose_reviewed,
        photoOverridden: row.admin_purpose_overridden,
        albumPurpose: purpose(row.album?.admin_purpose ?? null),
        albumConfidence: row.album?.admin_purpose_confidence ?? null,
        albumSource: source(row.album?.admin_purpose_source ?? null),
        albumReviewed: row.album?.admin_purpose_reviewed ?? false,
      });
    }
    if (batch.length < pageSize) break;
  }
  return rows;
}

export default async function AdminPhotoPurposePage() {
  const albums = groupPurposeRows(await fetchPurposeRows());

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-5">
      <div className="mb-5">
        <h1 className="text-h1 font-semibold">사진 목적&amp;무드</h1>
        <p className="mt-1 text-body-sm text-muted">
          포트폴리오 목적을 검토하고, 섞여 들어간 사진만 개별 예외로 분류하세요. 이 값은 운영자
          화면에서만 표시됩니다.
        </p>
      </div>
      <PhotoPurposeWorkspace initialAlbums={albums} />
    </main>
  );
}

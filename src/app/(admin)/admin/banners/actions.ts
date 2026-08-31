"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "samae-banner";

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

// 배너가 걸린 화면 전체 무효화 (홈·카테고리·어드민)
function revalidateBannerSurfaces() {
  revalidatePath("/admin/banners");
  revalidatePath("/");
  revalidatePath("/c/[slug]", "page");
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

// datetime-local ("2026-08-27T10:00") → ISO. 빈 값이면 null(즉시/무기한).
function toIso(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// 공개 URL → 버킷 내 경로. 다른 버킷/형식이면 null (삭제 대상에서 제외).
function storagePath(url: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

// 배너 생성 — 이미지는 /api/banner/upload 가 먼저 올리고, 그 결과가 hidden 으로 넘어온다.
export async function createBanner(formData: FormData) {
  await assertAdmin();
  const imageUrl = str(formData, "image_url");
  if (!imageUrl) throw new Error("배너 이미지를 먼저 올려주세요.");

  const admin = createAdminClient();
  // 새 배너는 맨 뒤로
  const { data: last } = await admin
    .from("home_banners")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("home_banners").insert({
    title: str(formData, "title"),
    image_url: imageUrl,
    thumb_url: str(formData, "thumb_url") || null,
    width: Number(formData.get("width")) || null,
    height: Number(formData.get("height")) || null,
    link_url: str(formData, "link_url") || null,
    published: formData.get("published") === "on",
    sort_order: (last?.sort_order ?? 0) + 1,
    starts_at: toIso(str(formData, "starts_at")),
    ends_at: toIso(str(formData, "ends_at")),
  });
  if (error) throw new Error(error.message);
  revalidateBannerSurfaces();
}

// 배너 수정 (제목·링크·노출 기간) — 이미지 교체는 삭제 후 재등록.
export async function updateBanner(formData: FormData) {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("home_banners")
    .update({
      title: str(formData, "title"),
      link_url: str(formData, "link_url") || null,
      starts_at: toIso(str(formData, "starts_at")),
      ends_at: toIso(str(formData, "ends_at")),
    })
    .eq("id", str(formData, "id"));
  if (error) throw new Error(error.message);
  revalidateBannerSurfaces();
}

// 공개/비공개 토글
export async function toggleBannerPublished(formData: FormData) {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("home_banners")
    .update({ published: formData.get("published") !== "true" })
    .eq("id", str(formData, "id"));
  if (error) throw new Error(error.message);
  revalidateBannerSurfaces();
}

// 순서 변경 — 인접 배너와 sort_order 교환.
export async function moveBanner(formData: FormData) {
  await assertAdmin();
  const id = str(formData, "id");
  const dir = str(formData, "dir"); // "up" | "down"
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("home_banners")
    .select("id, sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const list = rows ?? [];
  const i = list.findIndex((r) => r.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= list.length) return;

  // sort_order 가 같은 값으로 몰려 있어도 정렬이 확정되도록 목록 순서대로 다시 채번한다.
  const reordered = [...list];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  for (const [k, row] of reordered.entries()) {
    await admin.from("home_banners").update({ sort_order: k }).eq("id", row.id);
  }
  revalidateBannerSurfaces();
}

// 삭제 — DB 행 + Storage 원본/썸네일까지 정리 (배너는 복구 가치가 없어 소프트삭제 대상 아님).
export async function deleteBanner(formData: FormData) {
  await assertAdmin();
  const id = str(formData, "id");
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("home_banners")
    .select("image_url, thumb_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("home_banners").delete().eq("id", id);
  if (error) throw new Error(error.message);

  const paths = [storagePath(row?.image_url ?? null), storagePath(row?.thumb_url ?? null)].filter(
    (p): p is string => !!p
  );
  if (paths.length > 0) await admin.storage.from(BUCKET).remove(paths);

  revalidateBannerSurfaces();
}

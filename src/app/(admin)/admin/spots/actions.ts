"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// 촬영 장소 어드민 액션. 아티클(admin/articles/actions.ts)과 같은 규약을 따른다.

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

function revalidateSpotSurfaces() {
  revalidatePath("/admin/spots");
  revalidatePath("/spots");
  revalidatePath("/spots/[slug]", "page");
  revalidatePath("/explore"); // 매거진 SPOTS 레일
  revalidatePath("/sitemap.xml");
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

/**
 * slug 를 영문·숫자·하이픈으로만 정리한다.
 *
 * 장소는 Q&A·아티클과 달리 **한글 slug 를 쓰지 않는다.** 기존 22건이 전부 영문이고
 * (`euljiro`, `gyeongbokgung`), 한글을 섞으면 인코딩/디코딩 사고가 날 자리가 생긴다.
 */
function normalizeSlug(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const admin = createAdminClient();
  const root = normalizeSlug(base) || "spot";
  for (let n = 1; n < 50; n += 1) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const { data } = await admin.from("spots").select("id").eq("slug", candidate).maybeSingle();
    if (!data || data.id === excludeId) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/** 키워드는 쉼표로 받는다 — `photos.location_text` 에 실제로 적히는 말들이다. */
function keywords(fd: FormData): string[] {
  return str(fd, "keywords")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export async function createSpot(formData: FormData) {
  await assertAdmin();
  const name = str(formData, "name") || "이름 없는 장소";
  const slugInput = str(formData, "slug") || name;
  const admin = createAdminClient();
  const { error } = await admin.from("spots").insert({
    slug: await uniqueSlug(slugInput),
    name,
    city: str(formData, "city") || "서울",
    area: str(formData, "area"),
    // 비공개로 만든다. 팩트체크가 끝나야 켠다(0112 마이그레이션 주석의 세 조건).
    published: false,
  });
  if (error) throw new Error(`장소 생성 실패: ${error.message}`);
  revalidateSpotSurfaces();
}

export async function updateSpot(formData: FormData) {
  await assertAdmin();
  const id = str(formData, "id");
  if (!id) throw new Error("대상이 없습니다.");

  const admin = createAdminClient();
  /*
    ⚠️ slug 는 **이름을 바꿔도 따라 바꾸지 않는다.**
       /spots/<slug> 가 이미 색인돼 있고 매거진 레일도 그 주소를 쓴다.
       주소를 바꿔야 하면 새로 만들고 옛것을 내리는 게 맞다.
  */
  const { error } = await admin
    .from("spots")
    .update({
      name: str(formData, "name"),
      city: str(formData, "city"),
      area: str(formData, "area"),
      address: str(formData, "address"),
      // 출처에 없으면 null — 지어내지 않는다(빈 문자열로 두면 '확인했는데 없음'과 구별이 안 된다)
      station: str(formData, "station") || null,
      descr: String(formData.get("descr") ?? ""),
      tip: String(formData.get("tip") ?? ""),
      keywords: keywords(formData),
      source: str(formData, "source"),
      sort_order: Number(str(formData, "sort_order")) || 0,
    })
    .eq("id", id);
  if (error) throw new Error(`장소 저장 실패: ${error.message}`);
  revalidateSpotSurfaces();
}

export async function toggleSpotPublished(formData: FormData) {
  await assertAdmin();
  const id = str(formData, "id");
  const next = str(formData, "next") === "1";
  const admin = createAdminClient();

  /*
    공개로 켤 때는 **출처(source)가 있어야 한다.**

    published 의 뜻이 "팩트체크가 끝났다"라서, 근거 없이 켜면 그 뜻이 사라진다.
    UI 의 required 만으로는 막을 수 없다(폼을 우회할 수 있고, 목록에서 바로 켜는 버튼도 있다).
  */
  if (next) {
    const { data } = await admin.from("spots").select("source").eq("id", id).maybeSingle();
    if (!data?.source?.trim()) {
      throw new Error("공개하려면 출처를 먼저 적어야 합니다 — 무엇으로 확인했는지가 근거입니다.");
    }
  }

  const { error } = await admin.from("spots").update({ published: next }).eq("id", id);
  if (error) throw new Error(`공개 상태 변경 실패: ${error.message}`);
  revalidateSpotSurfaces();
}

export async function deleteSpot(formData: FormData) {
  await assertAdmin();
  const id = str(formData, "id");
  const admin = createAdminClient();
  const { error } = await admin.from("spots").delete().eq("id", id);
  if (error) throw new Error(`삭제 실패: ${error.message}`);
  revalidateSpotSurfaces();
}

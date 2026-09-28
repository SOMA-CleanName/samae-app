"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rebakeGuideImages } from "@/lib/guide-bake";
import { resolveGuideStyle, type GuideStyle } from "@/lib/guide-style";

// 안내 이미지 CRUD — getCurrentUser().photographer 는 profile_id = auth.uid() 로 조회된 내 작가 행이라
// photographer_id 를 여기서 강제하면 남의 행은 애초에 매칭되지 않는다(RLS 가 최종 방어).
async function requirePhotographer() {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  return me.photographer.id;
}

function revalidate() {
  revalidatePath("/studio/guide");
}

const MAX_CAPTION = 200;

export async function addGuideImage(input: {
  imageUrl: string;
  thumbUrl?: string | null;
  width?: number | null;
  height?: number | null;
}): Promise<{ id: string }> {
  const photographerId = await requirePhotographer();
  const imageUrl = String(input.imageUrl || "").slice(0, 500);
  if (!imageUrl) throw new Error("이미지가 없습니다.");

  const supabase = await createClient();

  // 맨 뒤에 추가
  const { data: last } = await supabase
    .from("photographer_guide_images")
    .select("sort_order")
    .eq("photographer_id", photographerId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("photographer_guide_images")
    .insert({
      photographer_id: photographerId,
      image_url: imageUrl,
      thumb_url: typeof input.thumbUrl === "string" ? input.thumbUrl.slice(0, 500) : null,
      width: typeof input.width === "number" ? input.width : null,
      height: typeof input.height === "number" ? input.height : null,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidate();
  return { id: data.id as string };
}

export async function updateGuideImage(
  id: string,
  patch: { caption?: string; published?: boolean }
) {
  const photographerId = await requirePhotographer();
  const supabase = await createClient();

  const next: Record<string, unknown> = {};
  if (typeof patch.caption === "string") next.caption = patch.caption.slice(0, MAX_CAPTION);
  if (typeof patch.published === "boolean") next.published = patch.published;
  if (!Object.keys(next).length) return;

  const { error } = await supabase
    .from("photographer_guide_images")
    .update(next)
    .eq("id", id)
    .eq("photographer_id", photographerId);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function removeGuideImage(id: string) {
  const photographerId = await requirePhotographer();
  const supabase = await createClient();
  const { error } = await supabase
    .from("photographer_guide_images")
    .delete()
    .eq("id", id)
    .eq("photographer_id", photographerId);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function reorderGuideImages(ids: string[]) {
  const photographerId = await requirePhotographer();
  const supabase = await createClient();
  // 장수가 많지 않아(수 장~수십 장) 순차 update 로 충분 — about 섹션 정렬과 동일 방식
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from("photographer_guide_images")
      .update({ sort_order: i })
      .eq("id", ids[i])
      .eq("photographer_id", photographerId);
    if (error) throw new Error(error.message);
  }
  revalidate();
}

// ── 사매 양식 ────────────────────────────────────────────────────
//
// 작가가 고르는 것은 **겉모습뿐이다** — 템플릿·배경지·글씨체. 안에 들어가는 내용(KB 카드)은
// 운영이 등록하고 작가는 못 바꾼다. 그래서 여기서는 검토 없이 바로 다시 구워도 된다:
// 틀린 정보가 나갈 길이 없고, 마음에 안 들면 다시 고르면 된다.

/** 작가가 올린 배경 사진 — 본인 폴더 아래에만 쓴다 */
export async function uploadMyGuideBackdrop(
  form: FormData
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const photographerId = await requirePhotographer();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "파일을 골라주세요." };
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "8MB 이하로 올려주세요." };

  const supabase = await createClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
  const path = `${photographerId}/backdrop/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("samae-guide")
    .upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, url: supabase.storage.from("samae-guide").getPublicUrl(path).data.publicUrl };
}

/**
 * 양식을 저장하고 **곧바로 다시 굽는다.**
 *
 * 저장만 하고 끝내면 작가는 고른 양식이 적용된 줄 알지만 프로필에는 옛 그림이 남는다.
 * 고르는 화면에서 본 것과 프로필에 걸리는 것이 같아야 한다.
 */
export async function saveMyGuideStyle(
  style: GuideStyle
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const photographerId = await requirePhotographer();
  const admin = createAdminClient();

  const { error } = await admin
    .from("photographers")
    .update({ guide_style: resolveGuideStyle(style) })
    .eq("id", photographerId);
  if (error) return { ok: false, error: error.message };

  const r = await rebakeGuideImages(photographerId);
  revalidate();
  return r.ok ? { ok: true, count: r.count } : { ok: false, error: r.error };
}

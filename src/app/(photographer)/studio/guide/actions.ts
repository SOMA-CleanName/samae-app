"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

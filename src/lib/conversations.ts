import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

// 대화방 get-or-create.
// 사진에서 시작하면(photoId) 그 사진을 채팅 버블이 아니라 대화의 출처 사진으로 기록(상담 정보에 노출).
export async function getOrCreateConversation(photographerId: string, photoId = "") {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  // 본인이 그 작가면 자기 자신과 대화 불가
  if (me.photographer?.id === photographerId) redirect("/studio");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", me.id)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (existing) return existing.id as string;

  const sourcePhotoPath = await getSourcePhotoPath(photoId);

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      user_id: me.id,
      photographer_id: photographerId,
      source_photo_path: sourcePhotoPath,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return created.id as string;
}

async function getSourcePhotoPath(photoId: string) {
  if (!photoId) return null;

  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("photos")
    .select("src_url, thumb_url")
    .eq("id", photoId)
    .maybeSingle();

  return photo ? photo.thumb_url ?? photo.src_url : null;
}

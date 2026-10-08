import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAdditions } from "@/lib/mood-additions-data";
import { normTag, summarizeAuthorTags, type AuthorTag } from "@/lib/mood-author-tags";
import { mergePhotoTerms, type PhotoTerm } from "@/lib/mood-photo-terms";
import { loadPhotoTermAxes, loadPhotoTermEdits, loadPhotoTermMerges } from "@/lib/mood-photo-terms-data";
import { loadScreenList } from "@/lib/mood-screen-data";
import type { ScreenList } from "@/lib/mood-screen";

export type TagPhoto = { photographer_id: string | null; visibility: string; mood_tags: string[] | null; auto_mood_tags: string[] | null };

/**
 * 무드 어드민 화면들이 같이 쓰는 재료(docs/40 §17-5) — 1차 전처리 목록(파일) · 사진 · 작가 태그(DB 읽기만) · 사진 무드 표현(파일 + 태그 합침).
 * 무드 목록 화면과 축 · 검색어의 사진 무드 표현 화면이 같은 뼈대를 봐야 하므로 한 곳에서 만든다.
 */
export async function loadMoodAdminData(): Promise<{
  screen: ScreenList; photos: TagPhoto[]; profiles: { id: string; mood_tags: string[] | null }[];
  authorTags: AuthorTag[]; screenAxes: Map<string, string[]>; photoTerms: PhotoTerm[];
}> {
  const admin = createAdminClient();
  // 사진은 보관만 빼고 센다 — 작가가 비공개로 올린 사진의 태그도 작가가 쓴 말이다
  const getPhotos = async () => {
    const photos: TagPhoto[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from("photos").select("photographer_id,visibility,mood_tags,auto_mood_tags")
        .neq("visibility", "archived").order("id").range(offset, offset + 999);
      if (error) throw new Error("사진 태그를 불러오지 못했습니다.");
      photos.push(...((data ?? []) as TagPhoto[]));
      if ((data?.length ?? 0) < 1000) break;
    }
    return photos;
  };
  const getProfiles = async () => {
    const { data, error } = await admin.from("photographers").select("id,mood_tags");
    if (error) throw new Error("작가 프로필 태그를 불러오지 못했습니다.");
    return (data ?? []) as { id: string; mood_tags: string[] | null }[];
  };
  const [screen, photos, profiles, additions, photoEdits, axisFixes, merges] = await Promise.all([
    loadScreenList(), getPhotos(), getProfiles(), loadAdditions(), loadPhotoTermEdits(), loadPhotoTermAxes(), loadPhotoTermMerges(),
  ]);

  const screenAxes = new Map<string, string[]>();
  for (const word of screen.words) for (const w of [word.w, ...(word.alt ?? [])]) screenAxes.set(normTag(w), word.axes);
  const authorTags = summarizeAuthorTags(photos, profiles, new Set(screenAxes.keys()));
  const photoTerms = mergePhotoTerms(additions.entries, authorTags, screenAxes, photoEdits, axisFixes, merges);
  return { screen, photos, profiles, authorTags, screenAxes, photoTerms };
}

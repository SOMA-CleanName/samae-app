"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugifyQuestion, type GuideAxis } from "@/lib/guide";

// Q&A 어드민 액션. 아티클(admin/articles/actions.ts)과 같은 규약을 따른다.

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

/*
  Q&A 가 걸린 화면 전체 무효화.

  허브·상세는 revalidate=86400 이고 매거진·사이트맵에도 실린다. 명시적으로 털어야
  즉시 반영된다 — 운영자가 고쳤는데 하루 동안 옛 문구가 보이면 고친 줄 모른다.
*/
function revalidateGuideSurfaces() {
  revalidatePath("/admin/guide");
  revalidatePath("/guide");
  revalidatePath("/guide/[slug]", "page");
  revalidatePath("/explore"); // 매거진 Q&A 섹션
  revalidatePath("/sitemap.xml");
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

/** 질문에서 slug 를 만들되, 이미 쓰는 slug 면 -2, -3 을 붙인다. */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const admin = createAdminClient();
  const root = slugifyQuestion(base) || "질문";
  for (let n = 1; n < 50; n += 1) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const { data } = await admin
      .from("guide_items")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data || data.id === excludeId) return candidate;
  }
  return `${root}-${Date.now()}`;
}

const AXES: GuideAxis[] = ["client", "field", "taste", "maker", "scene"];
function axisOf(fd: FormData): GuideAxis {
  const v = str(fd, "axis") as GuideAxis;
  return AXES.includes(v) ? v : "client";
}

export async function createGuideItem(formData: FormData) {
  await assertAdmin();
  const question = str(formData, "question") || "제목 없는 질문";
  const admin = createAdminClient();
  const { error } = await admin.from("guide_items").insert({
    slug: await uniqueSlug(question),
    question,
    axis: axisOf(formData),
    axis_label: str(formData, "axis_label"),
    // 비공개로 만든다. 다 쓰고 켠다 — 짧은 답은 단독 페이지로 두면 thin content 다.
    published: false,
  });
  if (error) throw new Error(`Q&A 생성 실패: ${error.message}`);
  revalidateGuideSurfaces();
}

export async function updateGuideItem(formData: FormData) {
  await assertAdmin();
  const id = str(formData, "id");
  if (!id) throw new Error("대상이 없습니다.");
  const question = str(formData, "question") || "제목 없는 질문";

  const admin = createAdminClient();
  /*
    ⚠️ slug 는 **질문을 바꿔도 따라 바꾸지 않는다.**
       이미 색인된 URL 이 깨지고, 다른 지면에서 걸어 둔 링크도 죽는다.
       주소를 바꿔야 하면 새로 만들고 옛것을 내리는 게 맞다.
  */
  const { error } = await admin
    .from("guide_items")
    .update({
      question,
      answer: String(formData.get("answer") ?? ""), // 줄바꿈을 살린다 — trim 하지 않는다
      axis: axisOf(formData),
      axis_label: str(formData, "axis_label"),
      sort_order: Number(str(formData, "sort_order")) || 0,
    })
    .eq("id", id);
  if (error) throw new Error(`Q&A 저장 실패: ${error.message}`);
  revalidateGuideSurfaces();
}

export async function toggleGuidePublished(formData: FormData) {
  await assertAdmin();
  const id = str(formData, "id");
  const next = str(formData, "next") === "1";
  const admin = createAdminClient();
  const { error } = await admin.from("guide_items").update({ published: next }).eq("id", id);
  if (error) throw new Error(`공개 상태 변경 실패: ${error.message}`);
  revalidateGuideSurfaces();
}

export async function deleteGuideItem(formData: FormData) {
  await assertAdmin();
  const id = str(formData, "id");
  const admin = createAdminClient();
  const { error } = await admin.from("guide_items").delete().eq("id", id);
  if (error) throw new Error(`삭제 실패: ${error.message}`);
  revalidateGuideSurfaces();
}

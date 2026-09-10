"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugifyTitle } from "@/lib/articles";

// 아티클 어드민 액션. 배너(admin/banners/actions.ts)와 같은 규약을 따른다.

async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

// 아티클이 걸린 화면 전체 무효화. 목록·상세 모두 revalidate=86400 이라 명시적으로 털어야 즉시 반영된다.
function revalidateArticleSurfaces() {
  revalidatePath("/admin/articles");
  revalidatePath("/articles");
  revalidatePath("/articles/[slug]", "page");
  revalidatePath("/sitemap.xml");
}

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

/** 제목에서 slug 를 만들되, 이미 쓰는 slug 면 -2, -3 을 붙인다. */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const admin = createAdminClient();
  const root = slugifyTitle(base) || "article";
  for (let n = 1; n < 50; n += 1) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const { data } = await admin.from("articles").select("id").eq("slug", candidate).maybeSingle();
    if (!data || data.id === excludeId) return candidate;
  }
  // 50개까지 겹치는 건 사실상 없다. 그래도 무한루프는 만들지 않는다.
  return `${root}-${Date.now()}`;
}

export async function createArticle(formData: FormData) {
  await assertAdmin();
  const title = str(formData, "title") || "제목 없는 글";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("articles")
    .insert({
      title,
      slug: await uniqueSlug(title),
      summary: str(formData, "summary"),
      body_md: "",
      published: false, // 항상 비공개로 시작한다. 다 쓰고 켠다
    })
    .select("id")
    .single();
  if (error) throw new Error(`생성 실패: ${error.message}`);
  revalidateArticleSurfaces();
  redirect(`/admin/articles/${data.id}`);
}

export async function updateArticle(formData: FormData) {
  await assertAdmin();
  const id = str(formData, "id");
  if (!id) throw new Error("대상이 없습니다.");
  const title = str(formData, "title") || "제목 없는 글";

  // slug 는 비워두면 제목에서 새로 만든다. 직접 넣었으면 그 값을 존중한다
  // (공개 후 slug 를 바꾸면 기존 링크가 깨지므로 화면에서 경고한다).
  const rawSlug = str(formData, "slug");
  const slug = rawSlug ? await uniqueSlug(rawSlug, id) : await uniqueSlug(title, id);

  const admin = createAdminClient();
  const { error } = await admin
    .from("articles")
    .update({
      title,
      slug,
      summary: str(formData, "summary"),
      body_md: String(formData.get("body_md") ?? ""), // 본문은 공백·줄바꿈이 의미라 trim 하지 않는다
      cover_url: str(formData, "cover_url") || null,
      cover_alt: str(formData, "cover_alt"),
      sort_order: Number(str(formData, "sort_order") || 0),
    })
    .eq("id", id);
  if (error) throw new Error(`저장 실패: ${error.message}`);
  revalidateArticleSurfaces();
}

export async function toggleArticlePublished(formData: FormData) {
  await assertAdmin();
  const id = str(formData, "id");
  const next = str(formData, "next") === "1";
  const admin = createAdminClient();
  const { error } = await admin.from("articles").update({ published: next }).eq("id", id);
  if (error) throw new Error(`공개 상태 변경 실패: ${error.message}`);
  revalidateArticleSurfaces();
}

export async function deleteArticle(formData: FormData) {
  await assertAdmin();
  const id = str(formData, "id");
  const admin = createAdminClient();
  const { error } = await admin.from("articles").delete().eq("id", id);
  if (error) throw new Error(`삭제 실패: ${error.message}`);
  revalidateArticleSurfaces();
  redirect("/admin/articles");
}

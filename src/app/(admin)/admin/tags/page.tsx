import { listTagUsage, listGeneratedTagUsage } from "@/lib/tags";
import { TagsTabs } from "./TagsTabs";

export const dynamic = "force-dynamic";

// 태그 관리 — 공개 태그(mood_tags) 빈도·매핑, 숨김 태그(generated_tags) 관리.
export default async function AdminTagsPage() {
  const [publicUsage, generatedUsage] = await Promise.all([listTagUsage(), listGeneratedTagUsage()]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">태그</h1>
      <p className="mt-1 text-body-sm text-muted">
        공개 태그는 작가가 사진에 단 태그, 숨김 태그는 검색·추천에만 쓰이는 태그예요.
      </p>

      <TagsTabs
        publicTags={publicUsage.tags}
        publicPhotoCount={publicUsage.photoCount}
        mappedTagCount={publicUsage.mappedTagCount}
        generatedTags={generatedUsage.tags}
        generatedPhotoCount={generatedUsage.photoCount}
      />
    </main>
  );
}

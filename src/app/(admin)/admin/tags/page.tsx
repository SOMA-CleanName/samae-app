import { listTagUsage } from "@/lib/tags";
import { EmptyState } from "@/components/ui";
import { LayersIcon } from "@/components/user/icons";
import { TagTable } from "./TagTable";

export const dynamic = "force-dynamic";

// 태그 관리 — 작가가 사진에 단 태그의 사용 빈도와 카테고리 매핑 여부를 본다.
export default async function AdminTagsPage() {
  const { tags, photoCount, mappedTagCount } = await listTagUsage();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">태그</h1>
      <p className="mt-1 text-body-sm text-muted">
        작가가 사진에 단 태그의 사용 빈도예요. ‘미매핑’ 태그는 어떤 카테고리에도 연결돼 있지 않아요 — 카테고리에 추가하면 /c 페이지로 묶을 수 있어요.
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
        <span>
          고유 태그 <b className="text-fg">{tags.length}</b>
        </span>
        <span>
          매핑됨 <b className="text-fg">{mappedTagCount}</b>
        </span>
        <span>
          집계 사진 <b className="text-fg">{photoCount}</b>
        </span>
      </div>

      {tags.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<LayersIcon className="h-7 w-7" />}
          title="아직 사용된 태그가 없어요"
        />
      ) : (
        <TagTable tags={tags} />
      )}
    </main>
  );
}

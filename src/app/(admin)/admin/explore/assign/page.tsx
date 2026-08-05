import Link from "next/link";
import {
  listExploreCategoriesWithCounts,
  fetchAllExploreAssignPhotos,
  getAllExploreMemberships,
  type AssignPhotoWithCats,
} from "@/lib/explore-db";
import { ExplorePhotoAssigner } from "../ExplorePhotoAssigner";
import {
  listTargetsWithExplores,
  getAllTargetMemberships,
  loadAlbumFlags,
  getExploreMembershipSources,
  getTargetMembershipSources,
} from "@/lib/target-categories";

export const dynamic = "force-dynamic";

// 사진→카테고리 할당 — 포트폴리오별로 사진을 보고, 타깃 카테고리에 담기/빼기. (docs/20)
// 전체 published 사진을 한 번에 로드(더보기 없음).
export default async function AdminExploreAssignPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; album?: string }>;
}) {
  const { cat: initialCat, album: focusAlbum } = await searchParams;
  const [cats, photos, mem, targets, targetMem, albumFlags, exploreSrc, targetSrc] =
    await Promise.all([
      listExploreCategoriesWithCounts(),
      fetchAllExploreAssignPhotos(),
      getAllExploreMemberships(),
      listTargetsWithExplores(),
      getAllTargetMemberships(),
      loadAlbumFlags(),
      getExploreMembershipSources(),
      getTargetMembershipSources(),
    ]);
  const initial: AssignPhotoWithCats[] = photos.map((p) => ({
    ...p,
    categoryIds: mem[p.id] ?? [],
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-h1 font-semibold">사진에 카테고리 지정</h1>
        <Link
          href="/admin/explore"
          className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]"
        >
          ← 카테고리 관리
        </Link>
      </div>
      <p className="mt-1 mb-4 text-body-sm text-muted">
        담을 카테고리를 고르고 사진을 탭해 담기/빼기. 사진 아래 배지가 출처예요 —{" "}
        <b className="text-fg">작가</b>(포트폴리오에서 고름) · <b className="text-fg">운영자</b>(직접
        담음) · <b className="text-fg">제외됨</b>(작가 선택을 덮어씀).
      </p>

      <ExplorePhotoAssigner
        categories={cats.map((c) => ({ id: c.id, title: c.title }))}
        targetCategories={targets.map((t) => ({ id: t.id, title: t.name }))}
        initialPhotos={initial}
        initialTargetMemberships={targetMem}
        albumFlags={albumFlags}
        exploreSources={exploreSrc}
        targetSources={targetSrc}
        initialCategoryId={initialCat}
        focusAlbumId={focusAlbum}
      />
    </main>
  );
}

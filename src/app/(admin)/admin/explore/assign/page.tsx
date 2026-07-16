import Link from "next/link";
import {
  listExploreCategoriesWithCounts,
  fetchExploreAssignPhotos,
  getExploreMembershipsForPhotos,
  type AssignPhotoWithCats,
} from "@/lib/explore-db";
import { ExplorePhotoAssigner } from "../ExplorePhotoAssigner";

export const dynamic = "force-dynamic";

// 사진→카테고리 할당 — 포트폴리오별로 사진을 보고, 타깃 카테고리에 담기/빼기. (docs/20)
export default async function AdminExploreAssignPage() {
  const [cats, photos] = await Promise.all([
    listExploreCategoriesWithCounts(),
    fetchExploreAssignPhotos(0),
  ]);
  const mem = await getExploreMembershipsForPhotos(photos.map((p) => p.id));
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
        담을 카테고리를 고르고 사진을 탭해 담기/빼기. 포트폴리오(앨범) 단위 일괄 담기도 돼요.
      </p>

      <ExplorePhotoAssigner
        categories={cats.map((c) => ({ id: c.id, title: c.title }))}
        initialPhotos={initial}
      />
    </main>
  );
}

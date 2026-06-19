import Link from "next/link";
import { listCategoriesWithCounts, isUntaggedCategory } from "@/lib/categories";
import { listAllTags } from "@/lib/tags";
import { Badge, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { LayersIcon } from "@/components/user/icons";
import { CategoryFields } from "./CategoryFields";
import {
  createCategory,
  updateCategory,
  toggleCategoryPublished,
  deleteCategory,
} from "./actions";

export const dynamic = "force-dynamic";

// 카테고리 관리 — 운영자가 카테고리를 만들고, 매칭 사진 수를 보고, 페이지를 공개한다.
export default async function AdminCategoriesPage() {
  const [cats, allTags] = await Promise.all([listCategoriesWithCounts(), listAllTags()]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">카테고리</h1>
      <p className="mt-1 text-body-sm text-muted">
        태그를 매핑하면 겹치는 사진이 카테고리 페이지(/c/슬러그)에 노출돼요. 공개하면 광고 랜딩으로 쓸 수 있어요.
      </p>

      {/* 생성 */}
      <form action={createCategory} className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <p className="text-body-sm font-semibold">새 카테고리</p>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <LabeledInput name="name" label="이름" placeholder="프로필/증명사진" required />
          <LabeledInput name="slug" label="slug (URL, 비우면 자동)" placeholder="portrait" />
          <div className="sm:col-span-2">
            <CategoryFields allTags={allTags} />
          </div>
          <div className="sm:col-span-2">
            <LabeledInput name="description" label="설명 (선택)" placeholder="단정한 프로필·증명사진 모음" />
          </div>
        </div>
        <SubmitButton pendingText="추가 중…" className="mt-3 cursor-pointer rounded-lg bg-fg px-4 py-2 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50">
          카테고리 추가
        </SubmitButton>
      </form>

      {/* 목록 */}
      {cats.length === 0 ? (
        <EmptyState className="mt-6" icon={<LayersIcon className="h-7 w-7" />} title="아직 카테고리가 없어요" />
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {cats.map((c) => (
            <li key={c.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-title font-semibold text-fg">{c.name}</p>
                    <Badge tone={c.published ? "success" : "neutral"}>{c.published ? "공개" : "비공개"}</Badge>
                    <span className="text-caption text-faint">/c/{c.slug}</span>
                  </div>
                  <p className="mt-1 text-caption text-muted">
                    매칭 사진 <b className="text-fg">{c.photoCount}</b>장
                    {isUntaggedCategory(c.tags) ? (
                      <> · <span className="text-fg">태그 없는 사진 (임시)</span></>
                    ) : (
                      c.tags.length > 0 && <> · 태그 {c.tags.join(", ")}</>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.published && (
                    <Link
                      href={`/c/${c.slug}`}
                      target="_blank"
                      className="rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]"
                    >
                      페이지 보기 ↗
                    </Link>
                  )}
                  <form action={toggleCategoryPublished}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="published" value={c.published ? "0" : "1"} />
                    <SubmitButton pendingText="처리 중…" className="cursor-pointer rounded-full bg-fg/[0.06] px-3 py-1 text-caption font-medium text-fg transition-colors hover:bg-fg/10 disabled:opacity-50">
                      {c.published ? "비공개로" : "공개"}
                    </SubmitButton>
                  </form>
                </div>
              </div>

              {/* 편집 (펼침) */}
              <details className="mt-3">
                <summary className="cursor-pointer text-caption text-muted">편집·삭제</summary>
                <form action={updateCategory} className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <input type="hidden" name="id" value={c.id} />
                  <LabeledInput name="name" label="이름" defaultValue={c.name} required />
                  <LabeledInput name="slug" label="slug" defaultValue={c.slug} />
                  <div className="sm:col-span-2">
                    <CategoryFields allTags={allTags} defaultTags={c.tags} />
                  </div>
                  <div className="sm:col-span-2">
                    <LabeledInput name="description" label="설명" defaultValue={c.description} />
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <SubmitButton pendingText="저장 중…" className="cursor-pointer rounded-lg bg-fg px-4 py-2 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50">
                      저장
                    </SubmitButton>
                  </div>
                </form>
                <form
                  action={deleteCategory}
                  className="mt-2"
                >
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton pendingText="삭제 중…" className="cursor-pointer text-caption font-medium text-danger hover:underline disabled:opacity-50">
                    카테고리 삭제
                  </SubmitButton>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function LabeledInput({
  name,
  label,
  placeholder,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption text-muted">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm outline-none transition-colors focus:border-fg/40"
      />
    </label>
  );
}

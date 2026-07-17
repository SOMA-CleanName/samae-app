import Link from "next/link";
import { listExploreCategoriesWithCounts } from "@/lib/explore-db";
import { ExplorePreviewPicker } from "./ExplorePreviewPicker";
import { ExploreCoverPicker } from "./ExploreCoverPicker";
import { Badge, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ConfirmForm } from "@/components/admin/ConfirmForm";
import { LayersIcon } from "@/components/user/icons";
import {
  createExploreCategory,
  updateExploreCategory,
  toggleExplorePublished,
  moveExploreCategory,
  deleteExploreCategory,
} from "./actions";

export const dynamic = "force-dynamic";

// 탐색 편집형 카테고리 관리 — 운영이 만들고, 사진을 손으로 담고(청크 3), 순서·공개를 제어.
// 광고 랜딩(/admin/categories)과 별개 체계다. (docs/20)
export default async function AdminExplorePage() {
  const cats = await listExploreCategoriesWithCounts();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-h1 font-semibold">탐색 카테고리</h1>
        <Link
          href="/admin/explore/assign"
          className="shrink-0 rounded-full bg-fg px-3.5 py-1.5 text-caption font-semibold text-bg transition-opacity hover:opacity-90"
        >
          사진에 카테고리 지정 →
        </Link>
      </div>
      <p className="mt-1 text-body-sm text-muted">
        카테고리를 만들고 순서·공개를 관리해요. 사진 담기는{" "}
        <Link href="/admin/explore/assign" className="font-medium text-fg underline">
          사진에 카테고리 지정
        </Link>{" "}
        에서 포트폴리오별로 해요. 공개하면 탐색(/explore)에 노출돼요.
      </p>

      {/* 생성 */}
      <form action={createExploreCategory} className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <p className="text-body-sm font-semibold">새 카테고리</p>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <LabeledInput name="title" label="이름" placeholder="일본 감성" required />
          <LabeledInput name="slug" label="slug (URL, 비우면 자동)" placeholder="japan" />
          <KindSelect />
          <div className="sm:col-span-2">
            <LabeledInput name="subtitle" label="부제 (선택)" placeholder="차분한 일본 무드 스냅" />
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
          {cats.map((c, i) => (
            <li key={c.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-title font-semibold text-fg">{c.title}</p>
                    <Badge tone={c.published ? "success" : "neutral"}>{c.published ? "공개" : "비공개"}</Badge>
                    {c.kind === "mood" && <Badge tone="info">무드</Badge>}
                    <span className="text-caption text-faint">/explore/{c.slug}</span>
                  </div>
                  <p className="mt-1 text-caption text-muted">
                    담긴 사진 <b className="text-fg">{c.photoCount}</b>장
                    {c.subtitle && <> · {c.subtitle}</>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* 순서 이동 */}
                  <div className="flex items-center gap-1">
                    <MoveButton id={c.id} dir="up" disabled={i === 0} label="위로" glyph="↑" />
                    <MoveButton id={c.id} dir="down" disabled={i === cats.length - 1} label="아래로" glyph="↓" />
                  </div>
                  {c.published && (
                    <Link
                      href={`/explore/${c.slug}`}
                      target="_blank"
                      className="rounded-full border border-line-strong px-3 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]"
                    >
                      페이지 보기 ↗
                    </Link>
                  )}
                  <form action={toggleExplorePublished}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="slug" value={c.slug} />
                    <input type="hidden" name="published" value={c.published ? "0" : "1"} />
                    <SubmitButton pendingText="처리 중…" className="cursor-pointer rounded-full bg-fg/[0.06] px-3 py-1 text-caption font-medium text-fg transition-colors hover:bg-fg/10 disabled:opacity-50">
                      {c.published ? "비공개로" : "공개"}
                    </SubmitButton>
                  </form>
                  <ConfirmForm
                    action={deleteExploreCategory}
                    message={`"${c.title}" 카테고리를 삭제할까요? 되돌릴 수 없어요(백업은 보관).`}
                  >
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton pendingText="삭제 중…" className="cursor-pointer rounded-full border border-danger/30 px-3 py-1 text-caption font-medium text-danger transition-colors hover:bg-danger/[0.06] disabled:opacity-50">
                      삭제
                    </SubmitButton>
                  </ConfirmForm>
                </div>
              </div>

              {/* 미리보기 사진(홈 스트립) — 담긴 사진 중에서 골라 순서 */}
              <ExplorePreviewPicker
                categoryId={c.id}
                slug={c.slug}
                previewPhotoIds={c.previewPhotoIds}
              />

              {/* 무드 카테고리 대표 사진 — 취향 테스트 스와이프 카드용 */}
              {c.kind === "mood" && (
                <ExploreCoverPicker categoryId={c.id} coverByPurpose={c.coverByPurpose} />
              )}

              {/* 편집 (펼침) */}
              <details className="mt-3">
                <summary className="cursor-pointer text-caption text-muted">편집</summary>
                <form action={updateExploreCategory} className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <input type="hidden" name="id" value={c.id} />
                  <LabeledInput name="title" label="이름" defaultValue={c.title} required />
                  <LabeledInput name="slug" label="slug" defaultValue={c.slug} />
                  <KindSelect defaultValue={c.kind} />
                  <div className="sm:col-span-2">
                    <LabeledInput name="subtitle" label="부제" defaultValue={c.subtitle} />
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <SubmitButton pendingText="저장 중…" className="cursor-pointer rounded-lg bg-fg px-4 py-2 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50">
                      저장
                    </SubmitButton>
                  </div>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function MoveButton({
  id,
  dir,
  disabled,
  label,
  glyph,
}: {
  id: string;
  dir: "up" | "down";
  disabled: boolean;
  label: string;
  glyph: string;
}) {
  const cls =
    "grid h-7 w-7 place-items-center rounded-full bg-fg/[0.06] text-caption font-semibold text-fg";
  // 끝단(맨 위/아래)은 이동 불가 — 비활성 표시.
  if (disabled) {
    return (
      <span aria-hidden className={`${cls} opacity-30`}>
        {glyph}
      </span>
    );
  }
  return (
    <form action={moveExploreCategory}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="dir" value={dir} />
      <SubmitButton
        pendingText="…"
        aria-label={label}
        className={`${cls} cursor-pointer transition-colors hover:bg-fg/10`}
      >
        {glyph}
      </SubmitButton>
    </form>
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

// 취향 테스트 분류 — 목적/무드/기타
function KindSelect({ defaultValue = "other" }: { defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption text-muted">종류 (취향 테스트)</span>
      <select
        name="kind"
        defaultValue={defaultValue === "mood" ? "mood" : "other"}
        className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm outline-none transition-colors focus:border-fg/40"
      >
        <option value="mood">무드 (빈티지·밝은·시크 등 — 취향 테스트가 씀)</option>
        <option value="other">기타 (테스트 미사용)</option>
      </select>
    </label>
  );
}

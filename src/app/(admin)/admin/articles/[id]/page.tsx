import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticleForAdmin } from "@/lib/articles";
import { Markdown } from "@/components/Markdown";
import { updateArticle, toggleArticlePublished, deleteArticle } from "../actions";

export const dynamic = "force-dynamic";

// 아티클 편집 — 마크다운 원문 입력 + 현재 저장된 내용의 미리보기.
// 미리보기는 **저장된 본문** 기준이다(서버 렌더). 실시간 미리보기는 클라이언트 상태가 필요해
// 지금은 넣지 않았다 — 저장하면 아래에서 바로 확인된다.
export default async function AdminArticleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const a = await getArticleForAdmin(id);
  if (!a) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/admin/articles" className="text-sm text-muted underline">
        ← 아티클 목록
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight">{a.title}</h1>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            a.published ? "bg-emerald-500/15 text-emerald-700" : "bg-fg/10 text-muted"
          }`}
        >
          {a.published ? "공개" : "초안"}
        </span>
        <form action={toggleArticlePublished} className="shrink-0">
          <input type="hidden" name="id" value={a.id} />
          <input type="hidden" name="next" value={a.published ? "0" : "1"} />
          <button
            type="submit"
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium"
          >
            {a.published ? "내리기" : "공개하기"}
          </button>
        </form>
      </div>

      <form action={updateArticle} className="mt-6 space-y-4">
        <input type="hidden" name="id" value={a.id} />

        <Field label="제목">
          <input name="title" defaultValue={a.title} required className={INPUT} />
        </Field>

        <Field
          label="주소(slug)"
          hint="비워두면 제목에서 자동 생성돼요. ⚠️ 공개 후에 바꾸면 기존 링크가 깨집니다."
        >
          <input name="slug" defaultValue={a.slug} className={INPUT} />
        </Field>

        <Field label="요약" hint="목록과 검색 결과에 그대로 보입니다. 2~3줄이 적당해요.">
          <textarea name="summary" defaultValue={a.summary} rows={2} className={INPUT} />
        </Field>

        <Field label="대표 이미지 URL" hint="비워도 됩니다. 배너 이미지 주소를 그대로 써도 돼요.">
          <input name="cover_url" defaultValue={a.cover_url ?? ""} className={INPUT} />
        </Field>

        <Field label="대표 이미지 설명" hint="화면에 안 보이지만 검색·접근성에 쓰입니다.">
          <input name="cover_alt" defaultValue={a.cover_alt} className={INPUT} />
        </Field>

        <Field
          label="본문 (마크다운)"
          hint="## 제목 · **굵게** · [링크](/spots/경복궁) · ![설명](이미지주소) · - 목록 · > 인용"
        >
          <textarea
            name="body_md"
            defaultValue={a.body_md}
            rows={22}
            className={`${INPUT} font-mono text-[13px] leading-relaxed`}
          />
        </Field>

        <Field label="정렬 순서" hint="작을수록 목록 위에 옵니다.">
          <input
            name="sort_order"
            type="number"
            defaultValue={a.sort_order}
            className={`${INPUT} w-28`}
          />
        </Field>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-fg px-5 py-2.5 text-sm font-semibold text-bg"
          >
            저장
          </button>
          <span className="text-xs text-muted">
            저장하면 아래 미리보기가 갱신됩니다.
          </span>
        </div>
      </form>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="text-sm font-semibold text-muted">미리보기 (저장된 본문)</h2>
        <div className="mt-3 rounded-xl border border-line px-5 py-4">
          {a.body_md.trim() ? (
            <Markdown source={a.body_md} />
          ) : (
            <p className="py-6 text-center text-sm text-muted">본문이 비어 있어요.</p>
          )}
        </div>
      </section>

      <form action={deleteArticle} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={a.id} />
        <button type="submit" className="text-xs text-red-600 underline">
          이 글 삭제
        </button>
      </form>
    </div>
  );
}

const INPUT = "w-full rounded-lg border border-line px-3 py-2 text-sm";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-muted">{label}</span>
      {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

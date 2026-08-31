import Link from "next/link";
import { listAllArticles } from "@/lib/articles";
import { createArticle, toggleArticlePublished } from "./actions";

export const dynamic = "force-dynamic";

// 아티클 목록 — 초안 포함. 새 글은 여기서 만들고 편집 화면으로 넘어간다.
export default async function AdminArticlesPage() {
  const articles = await listAllArticles();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">아티클</h1>
        <p className="mt-1.5 text-sm text-muted">
          스냅 촬영 정보를 담는 긴 글. <b>배너 링크</b>에 <code>/articles/슬러그</code> 를 넣으면
          홈 배너에서 바로 열립니다.
        </p>
      </header>

      <form action={createArticle} className="mb-8 rounded-xl border border-line p-4">
        <label className="block text-xs font-semibold text-muted">새 글 제목</label>
        <div className="mt-2 flex gap-2">
          <input
            name="title"
            required
            placeholder="예: 스냅 촬영, 처음이라면"
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg"
          >
            만들기
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">비공개 상태로 만들어집니다. 다 쓰고 공개하세요.</p>
      </form>

      {articles.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">아직 글이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {articles.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-xl border border-line px-4 py-3"
            >
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  a.published ? "bg-emerald-500/15 text-emerald-700" : "bg-fg/10 text-muted"
                }`}
              >
                {a.published ? "공개" : "초안"}
              </span>
              <Link href={`/admin/articles/${a.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{a.title}</span>
                <span className="block truncate text-xs text-muted">/articles/{a.slug}</span>
              </Link>
              {a.published && (
                <Link
                  href={`/articles/${encodeURIComponent(a.slug)}`}
                  target="_blank"
                  className="shrink-0 text-xs text-muted underline"
                >
                  보기
                </Link>
              )}
              <form action={toggleArticlePublished} className="shrink-0">
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="next" value={a.published ? "0" : "1"} />
                <button
                  type="submit"
                  className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium"
                >
                  {a.published ? "내리기" : "공개"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

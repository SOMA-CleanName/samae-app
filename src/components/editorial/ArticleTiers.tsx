import Link from "next/link";
import type { ArticleCard } from "@/lib/articles";

/**
 * 아티클 목록 조각 — 탐색 매거진과 /articles 지면이 함께 쓴다.
 *
 * 두 지면의 역할이 다르다.
 *   탐색(/explore)  — 표지. 덱(사진) → 가로 카드 → 목록 순으로 무게를 낮춰 훑게 한다
 *   목록(/articles) — 색인. '전체 보기'로 들어오는 곳이라 전부, 같은 밀도로 보여준다
 *
 * 그래서 카드 모양을 한곳에서 관리한다. 두 지면이 따로 그리면 같은 글이 다르게 보인다.
 */

function ymd(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** 날짜 · 조회수 한 줄 — 색인 카드와 공지 카드가 같은 규격을 쓴다. */
function RowMeta({ article, views }: { article: ArticleCard; views?: Record<string, number> }) {
  const date = ymd(article.published_at);
  const n = views?.[article.slug] ?? 0;
  if (!date && n === 0) return null;
  return (
    <span className="mt-1 flex items-center gap-2 text-[10.5px] tabular-nums text-faint">
      {date && <span>{date}</span>}
      {n > 0 && <span title="누적 조회수">조회 {n.toLocaleString("ko-KR")}</span>}
    </span>
  );
}

/**
 * 공지 — 색인 맨 위에 세우는 대표 글 한 편.
 *
 * "스냅 촬영, 처음이라면" 같은 입문 글은 색인에 섞이면 다른 글과 같은 무게로
 * 읽히는데, 처음 온 사람에겐 이 글이 출발점이다. 어느 글이 공지가 될지는
 * DB 컬럼이 아니라 **sort_order 1위**로 정한다 — 어드민이 순서만 바꾸면 된다.
 */
export function ArticleNotice({
  article,
  views,
}: {
  article: ArticleCard;
  views?: Record<string, number>;
}) {
  return (
    <Link
      href={`/articles/${encodeURIComponent(article.slug)}`}
      className="ar-row mt-8 flex items-stretch gap-3.5 overflow-hidden rounded-xl border border-brand/45 bg-brand/[0.05] p-3.5"
    >
      <span className="relative block h-[92px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:h-[104px] sm:w-[104px]">
        {article.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.cover_url}
            alt=""
            className="ar-img h-full w-full object-cover"
          />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-ink">
          Notice
        </span>
        <span className="ar-title mt-1 line-clamp-2 block text-body font-bold leading-snug tracking-tight">
          {article.title}
        </span>
        {article.summary && (
          <span className="mt-1 line-clamp-2 block text-[11.5px] leading-relaxed text-muted">
            {article.summary}
          </span>
        )}
        <RowMeta article={article} views={views} />
      </span>

      <span className="ar-arrow shrink-0 self-center pr-1 text-[11px] text-faint">↗</span>
    </Link>
  );
}

/** 2단 — 작은 사진 왼쪽, 글 오른쪽. views 를 주면 날짜·조회수 줄이 붙는다. */
export function ArticleRows({
  articles,
  views,
}: {
  articles: ArticleCard[];
  views?: Record<string, number>;
}) {
  if (articles.length === 0) return null;
  return (
    <ul className="mt-4 grid gap-2.5 lg:grid-cols-2 lg:gap-3">
      {articles.map((a) => (
        <li key={a.id}>
          <Link
            href={`/articles/${encodeURIComponent(a.slug)}`}
            className="ar-row flex items-stretch gap-3 overflow-hidden rounded-xl border border-line bg-surface p-2.5"
          >
            <span className="relative block h-[74px] w-[74px] shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:h-[86px] sm:w-[86px]">
              {a.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.cover_url}
                  alt=""
                  loading="lazy"
                  className="ar-img h-full w-full object-cover"
                />
              )}
            </span>

            <span className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
              <span className="ar-title line-clamp-2 block text-body-sm font-bold leading-snug tracking-tight">
                {a.title}
              </span>
              {a.summary && (
                <span className="mt-1 line-clamp-2 block text-[11.5px] leading-relaxed text-muted">
                  {a.summary}
                </span>
              )}
              <RowMeta article={a} views={views} />
            </span>

            <span className="ar-arrow shrink-0 self-center pr-1 text-[11px] text-faint">↗</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 3단 — 글자만. 날짜를 오른쪽에 붙여 언제 쓴 글인지 보이게 한다. */
export function ArticleList({ articles }: { articles: ArticleCard[] }) {
  return (
    <ul className="mt-8 border-t border-line">
      {articles.map((a) => {
        const date = ymd(a.published_at);
        return (
          <li key={a.id} className="border-b border-line">
            <Link
              href={`/articles/${encodeURIComponent(a.slug)}`}
              className="ed-idx-row flex items-center gap-3 py-3.5"
            >
              <span className="ed-idx-label min-w-0 flex-1 truncate text-body font-semibold tracking-tight">
                {a.title}
              </span>
              {date && (
                <span className="shrink-0 text-[11px] tabular-nums text-muted">{date}</span>
              )}
              <span className="ed-idx-arrow shrink-0 text-body-sm text-faint">↗</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

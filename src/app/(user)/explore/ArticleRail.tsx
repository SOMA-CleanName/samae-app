import Link from "next/link";
import type { ArticleCard } from "@/lib/articles";

// 탐색 탭의 아티클 진입점 — 가로 레일.
// 글이 없으면 탐색 페이지에서 섹션째 렌더하지 않으므로 여기선 빈 상태를 다루지 않는다.
export function ArticleRail({ articles }: { articles: ArticleCard[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex gap-3">
        {articles.map((a, i) => (
          <li key={a.id} className="w-[248px] shrink-0">
            <Link href={`/articles/${encodeURIComponent(a.slug)}`} className="ed-cell group block">
              <span className="ed-num mb-1.5 block font-display text-[11px] italic text-faint tabular-nums">
                .{String(i + 1).padStart(2, "0")}
              </span>
              {a.cover_url ? (
                // 원격 도메인이 next.config 에 없을 수 있어 next/image 대신 <img>
                // eslint-disable-next-line @next/next/no-img-element
                <span className="block overflow-hidden rounded-sm bg-surface-2">
                  <img
                    src={a.cover_url}
                    alt={a.cover_alt || a.title}
                    loading="lazy"
                    className="aspect-[16/10] w-full object-cover"
                  />
                </span>
              ) : (
                <div className="flex aspect-[16/10] w-full items-center justify-center rounded-sm bg-surface-2 px-4 text-center">
                  <span className="text-sm font-semibold leading-snug text-fg/70">{a.title}</span>
                </div>
              )}
              <p className="mt-2 line-clamp-2 text-body-sm font-semibold leading-snug tracking-tight transition-colors group-hover:text-muted">
                {a.title}
              </p>
              {a.summary && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{a.summary}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

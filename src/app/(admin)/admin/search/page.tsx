import Link from "next/link";
import { listSearchStats } from "@/lib/search-stats";
import { EmptyState } from "@/components/ui";
import { SearchStatsTable } from "./SearchStatsTable";
import { SearchDebug } from "./SearchDebug";

export const dynamic = "force-dynamic";

const PERIODS = [
  { label: "7일", value: "7" },
  { label: "30일", value: "30" },
  { label: "전체", value: "all" },
];

// 검색 운영 — 인기 검색어/검색 실패어 통계 + 미니 검색 디버그(사진별 관련도 점수).
export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const daysParam = sp.days === "7" || sp.days === "all" ? sp.days : "30";
  const sinceDays = daysParam === "all" ? null : Number(daysParam);

  const { groups, totalSearches, uniqueTerms, zeroResultCount } = await listSearchStats(sinceDays);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">검색</h1>
      <p className="mt-1 text-body-sm text-muted">
        사용자가 친 검색어 순위예요. 대소문자·띄어쓰기는 자동으로 합치고, 가까운 오타는 대표어 아래로 묶었어요.
        ‘결과0’은 한 번도 결과를 못 준 검색어 — 누락된 태그나 신규 카테고리 후보예요.
      </p>

      {/* 기간 필터 */}
      <div className="mt-4 flex gap-1.5">
        {PERIODS.map((p) => {
          const active = p.value === daysParam;
          return (
            <Link
              key={p.value}
              href={`/admin/search?days=${p.value}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-caption font-medium transition-colors ${
                active ? "bg-fg text-bg" : "bg-fg/[0.06] text-muted hover:text-fg"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
        <span>
          총 검색 <b className="text-fg">{totalSearches}</b>
        </span>
        <span>
          고유 검색어 <b className="text-fg">{uniqueTerms}</b>
        </span>
        <span>
          결과0 <b className="text-fg">{zeroResultCount}</b>
        </span>
      </div>

      {groups.length === 0 ? (
        <EmptyState className="mt-6" title="아직 집계된 검색어가 없어요" />
      ) : (
        <SearchStatsTable groups={groups} />
      )}

      {/* 미니 검색 디버그 */}
      <section className="mt-10 border-t border-line pt-6">
        <h2 className="text-h2 font-semibold">검색 시뮬레이터</h2>
        <p className="mt-1 text-body-sm text-muted">
          검색어를 넣으면 실제 검색과 같은 점수로 채점해, 사진마다 어떤 필드가 몇 점을 줬는지 보여줘요.
        </p>
        <SearchDebug />
      </section>
    </main>
  );
}

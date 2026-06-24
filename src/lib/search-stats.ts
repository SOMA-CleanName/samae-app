import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { limitedEditDistance } from "@/lib/discovery";

export type SearchStatGroup = {
  term: string; // 대표어(클러스터 내 최빈 원문)
  compact: string; // 정규화 키
  count: number; // 총 검색 횟수(변형 포함)
  avgResults: number; // 평균 결과 수
  zeroResult: boolean; // 한 번도 결과를 못 준 검색어
  lastSearchedAt: string;
  variants: { raw: string; count: number }[]; // 합쳐진 표기/오타 변형
};

export type SearchStatsResult = {
  groups: SearchStatGroup[];
  totalSearches: number;
  uniqueTerms: number; // 클러스터(대표어) 수
  zeroResultCount: number;
  sinceDays: number | null;
};

const MAX_ROWS = 5000;

type Bucket = {
  compact: string;
  count: number;
  resultSum: number;
  lastAt: string;
  raws: Map<string, number>;
};

// 정규화 키가 가까우면(편집거리) 같은 오타군으로 본다.
// 짧은 단어의 과병합을 막으려 최소 길이 3 + 첫 글자 동일을 요구한다.
function isTypoVariant(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  if (a[0] !== b[0]) return false;
  if (Math.abs(a.length - b.length) > 2) return false;
  const limit = Math.max(a.length, b.length) >= 6 ? 2 : 1;
  return limitedEditDistance(a, b, limit) <= limit;
}

function topRaw(raws: Map<string, number>): string {
  let best = "";
  let bestCount = -1;
  for (const [raw, n] of raws) {
    if (n > bestCount) {
      best = raw;
      bestCount = n;
    }
  }
  return best;
}

export async function listSearchStats(sinceDays: number | null = 30): Promise<SearchStatsResult> {
  const admin = createAdminClient();

  let query = admin
    .from("search_logs")
    .select("raw, compact, result_count, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (sinceDays) {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
    query = query.gte("created_at", since);
  }
  const { data } = await query;
  const rows = (data ?? []) as { raw: string; compact: string; result_count: number; created_at: string }[];

  // 1차: 정규화 키(compact) 단위 집계
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    const b = buckets.get(r.compact);
    if (b) {
      b.count += 1;
      b.resultSum += r.result_count;
      b.raws.set(r.raw, (b.raws.get(r.raw) ?? 0) + 1);
      if (r.created_at > b.lastAt) b.lastAt = r.created_at;
    } else {
      buckets.set(r.compact, {
        compact: r.compact,
        count: 1,
        resultSum: r.result_count,
        lastAt: r.created_at,
        raws: new Map([[r.raw, 1]]),
      });
    }
  }

  // 2차: 오타 클러스터링 — 횟수 많은 키를 대표로, 가까운 소수 키를 변형으로 흡수
  const ordered = [...buckets.values()].sort((a, b) => b.count - a.count);
  const canonicals: Bucket[] = [];
  for (const bucket of ordered) {
    const host = canonicals.find((c) => isTypoVariant(c.compact, bucket.compact));
    if (host) {
      host.count += bucket.count;
      host.resultSum += bucket.resultSum;
      if (bucket.lastAt > host.lastAt) host.lastAt = bucket.lastAt;
      for (const [raw, n] of bucket.raws) host.raws.set(raw, (host.raws.get(raw) ?? 0) + n);
    } else {
      canonicals.push(bucket);
    }
  }

  const groups: SearchStatGroup[] = canonicals
    .map((c) => ({
      term: topRaw(c.raws),
      compact: c.compact,
      count: c.count,
      avgResults: c.count > 0 ? Math.round(c.resultSum / c.count) : 0,
      zeroResult: c.resultSum === 0,
      lastSearchedAt: c.lastAt,
      variants: [...c.raws.entries()]
        .map(([raw, count]) => ({ raw, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    groups,
    totalSearches: rows.length,
    uniqueTerms: groups.length,
    zeroResultCount: groups.filter((g) => g.zeroResult).length,
    sinceDays,
  };
}

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { limitedEditDistance } from "@/lib/discovery";
import { routeLabel, type SearchInterpretation } from "@/lib/search-interpretation";

export type SearchStatGroup = {
  term: string; // 대표어(클러스터 내 최빈 원문)
  compact: string; // 정규화 키
  count: number; // 총 검색 횟수(변형 포함)
  avgResults: number; // 평균 결과 수
  zeroResult: boolean; // 한 번도 결과를 못 준 검색어
  lastSearchedAt: string;
  variants: { raw: string; count: number }[]; // 합쳐진 표기/오타 변형
  // ── 검색어를 어떻게 해석했나 (0049 해석 칸) — 묶음 안 검색들을 합친 횟수 ──
  moods: Tally[]; // 잡힌 무드 가족
  filled: Tally[]; // 사진이 모자라 이어 붙인 비슷한 무드
  purposes: Tally[]; // 떼어낸 목적 키
  routes: Tally[]; // 어떤 길로 찾았나(lib/search-interpretation routeLabel)
  moodTexts: Tally[]; // 무드로 본 글자
};

export type Tally = { name: string; count: number };

/** 한 번의 검색 — 「최근 검색」 목록용 */
export type RecentSearch = SearchInterpretation & {
  raw: string;
  resultCount: number;
  at: string;
};

export type SearchStatsResult = {
  groups: SearchStatGroup[];
  totalSearches: number;
  uniqueTerms: number; // 클러스터(대표어) 수
  zeroResultCount: number;
  sinceDays: number | null;
  recent: RecentSearch[]; // 최근 검색 50건 — 검색어 하나하나가 어디로 갔나
};

const MAX_ROWS = 5000;

type Bucket = {
  compact: string;
  count: number;
  resultSum: number;
  lastAt: string;
  raws: Map<string, number>;
  moods: Map<string, number>;
  filled: Map<string, number>;
  purposes: Map<string, number>;
  routes: Map<string, number>;
  moodTexts: Map<string, number>;
};

type Row = {
  raw: string;
  compact: string;
  result_count: number;
  created_at: string;
  purposes: string[] | null;
  mood_text: string | null;
  mood_mode: "family" | "big" | null;
  mood_families: string[] | null;
  mood_filled: string[] | null;
};

function bump(map: Map<string, number>, key: string | null | undefined, n = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + n);
}

function merge(into: Map<string, number>, from: Map<string, number>) {
  for (const [k, n] of from) bump(into, k, n);
}

function tally(map: Map<string, number>): Tally[] {
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function interpretationOf(r: Row): SearchInterpretation {
  return {
    purposes: r.purposes ?? [],
    moodText: r.mood_text,
    moodMode: r.mood_mode,
    moodFamilies: r.mood_families ?? [],
    moodFilled: r.mood_filled ?? [],
  };
}

function addRow(b: Bucket, r: Row) {
  const i = interpretationOf(r);
  for (const m of i.moodFamilies) bump(b.moods, m);
  for (const m of i.moodFilled) bump(b.filled, m);
  for (const p of i.purposes) bump(b.purposes, p);
  bump(b.routes, routeLabel(i));
  bump(b.moodTexts, i.moodText);
}

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
    .select("raw, compact, result_count, created_at, purposes, mood_text, mood_mode, mood_families, mood_filled")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (sinceDays) {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
    query = query.gte("created_at", since);
  }
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  // 1차: 정규화 키(compact) 단위 집계
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    const b = buckets.get(r.compact);
    if (b) {
      b.count += 1;
      b.resultSum += r.result_count;
      b.raws.set(r.raw, (b.raws.get(r.raw) ?? 0) + 1);
      if (r.created_at > b.lastAt) b.lastAt = r.created_at;
      addRow(b, r);
    } else {
      const fresh: Bucket = {
        compact: r.compact,
        count: 1,
        resultSum: r.result_count,
        lastAt: r.created_at,
        raws: new Map([[r.raw, 1]]),
        moods: new Map(),
        filled: new Map(),
        purposes: new Map(),
        routes: new Map(),
        moodTexts: new Map(),
      };
      addRow(fresh, r);
      buckets.set(r.compact, fresh);
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
      merge(host.moods, bucket.moods);
      merge(host.filled, bucket.filled);
      merge(host.purposes, bucket.purposes);
      merge(host.routes, bucket.routes);
      merge(host.moodTexts, bucket.moodTexts);
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
      moods: tally(c.moods),
      filled: tally(c.filled),
      purposes: tally(c.purposes),
      routes: tally(c.routes),
      moodTexts: tally(c.moodTexts),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    groups,
    totalSearches: rows.length,
    uniqueTerms: groups.length,
    zeroResultCount: groups.filter((g) => g.zeroResult).length,
    sinceDays,
    // rows 는 최신순이다
    recent: rows.slice(0, 50).map((r) => ({
      ...interpretationOf(r),
      raw: r.raw,
      resultCount: r.result_count,
      at: r.created_at,
    })),
  };
}

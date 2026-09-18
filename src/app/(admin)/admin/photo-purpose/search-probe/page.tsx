import type { ReactNode } from "react";
import Link from "next/link";
import { embedSearchText } from "@/lib/siglip-text-search";
import { SIGLIP_SEARCH_MAX_RESULTS } from "@/lib/siglip-text-search-core";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/search-probe";
type Params = { q?: string; cut?: string };
type Row = { id: string; thumb_url: string | null; src_url: string; distance: number };

/**
 * 검색어 하나로 SigLIP 이 고른 사진을 **유사도 순서 그대로** 늘어놓는다.
 *
 * 검색 화면은 앨범 흩뜨리기·세로 비율 맞추기로 순서를 바꾸고 점수를 숨긴다.
 * 여기서는 둘 다 걷어내, "몇 점부터 사람이 비슷하다고 느끼나" 를 눈으로 정하게 한다.
 * 사진을 누르면 그 점수가 기준선이 되고, 그 아래는 흐려진다.
 */
export default async function SearchProbePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = (params.q ?? "노을").trim().slice(0, 60) || "노을";
  const cut = Number.isFinite(Number(params.cut)) && params.cut ? Number(params.cut) : null;

  const rows = await probe(q);
  const url = (changes: Params) =>
    `${BASE}?${new URLSearchParams(Object.entries({ q, ...changes }).filter(([, v]) => v))}`;

  const scores = rows.map((r) => 1 - r.distance);
  const top = scores[0] ?? 0;
  const kept = cut === null ? rows.length : scores.filter((s) => s >= cut).length;

  return (
    <section aria-labelledby="probe-heading">
      <h2 id="probe-heading" className="text-h2 font-semibold">검색 점수 보기</h2>
      <p className="mt-1 text-body-sm text-muted">
        검색 화면과 같은 SigLIP 결과를 <b className="text-fg">유사도 순서 그대로</b> 보여줍니다. 점수는 코사인 유사도입니다.{" "}
        <b className="text-fg">“여기부터는 아니다” 싶은 사진의 바로 앞 사진을 누르면</b> 그 점수가 기준선이 됩니다.
      </p>

      <form action={BASE} className="my-4 flex flex-wrap gap-2">
        <input key={`q-${q}`} name="q" defaultValue={q} maxLength={60} aria-label="검색어"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
        <button className="rounded-xl bg-fg px-5 py-2 text-bg">보기</button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-line p-8 text-center text-muted">
          결과가 없습니다. 임베딩 서버(8077)가 켜져 있는지 확인하세요.
        </p>
      ) : (
        <>
          <p className="mb-4 text-body-sm">
            “{q}” 상위 <b className="tabular-nums">{rows.length}</b>장 · 1위 <b className="tabular-nums">{top.toFixed(3)}</b> ·
            마지막 <b className="tabular-nums">{scores[scores.length - 1].toFixed(3)}</b>
            {cut !== null && (
              <>
                {" · "}<span className="text-brand">기준 <b className="tabular-nums">{cut.toFixed(3)}</b> 이상{" "}
                <b className="tabular-nums">{kept}</b>장 (1위의 {Math.round((cut / top) * 100)}%)</span>{" "}
                <Link href={url({})} className="text-muted underline hover:text-fg">기준 지우기</Link>
              </>
            )}
          </p>

          <ol className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {rows.map((row, i) => {
              const score = scores[i];
              const band = Math.floor(score * 100);
              const newBand = i === 0 || band !== Math.floor(scores[i - 1] * 100);
              const below = cut !== null && score < cut;
              return (
                <WithDivider key={row.id} divider={newBand ? `0.${String(band).padStart(2, "0")}대` : null}>
                  <li className={below ? "opacity-25" : ""}>
                    <Link href={url({ cut: score.toFixed(4) })} title={`${i + 1}위 · ${score.toFixed(4)}`}
                      className={`block overflow-hidden rounded-lg border ${cut !== null && Math.abs(score - cut) < 1e-6 ? "border-brand ring-2 ring-brand" : "border-line"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={row.thumb_url ?? row.src_url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                      <span className="flex items-baseline justify-between px-1.5 py-1 text-caption tabular-nums">
                        <span className="text-muted">#{i + 1}</span>
                        <b>{score.toFixed(3)}</b>
                        <span className="text-muted">{Math.round((score / top) * 100)}%</span>
                      </span>
                    </Link>
                  </li>
                </WithDivider>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

/** 점수대가 바뀌는 자리에 줄 전체 폭의 구분선을 끼운다 — 어디서 뚝 떨어지는지 보이게. */
function WithDivider({ divider, children }: { divider: string | null; children: ReactNode }) {
  return (
    <>
      {divider && (
        <li className="col-span-full mt-3 border-b border-line pb-1 text-caption font-semibold text-muted" aria-hidden>
          {divider}
        </li>
      )}
      {children}
    </>
  );
}

/** 검색 화면과 같은 경로 — SigLIP 임베딩 → kNN 300장 → 피드에서 내린 사진 제외. */
async function probe(q: string): Promise<Row[]> {
  const vector = await embedSearchText(q).catch(() => null);
  if (!vector) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("similar_photos_by_vector", {
    p_embedding: JSON.stringify(vector),
    p_limit: SIGLIP_SEARCH_MAX_RESULTS,
  });
  if (error || !data) return [];
  const rows = data as Row[];
  const { data: visible } = await admin
    .from("photos").select("id").in("id", rows.map((r) => r.id)).eq("feed_hidden", false);
  const shown = new Set((visible ?? []).map((v) => v.id as string));
  return rows.filter((r) => shown.has(r.id)).sort((a, b) => a.distance - b.distance);
}

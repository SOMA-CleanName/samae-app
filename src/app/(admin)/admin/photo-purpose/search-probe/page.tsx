import type { ReactNode } from "react";
import Link from "next/link";
import { embedSearchText } from "@/lib/siglip-text-search";
import { SIGLIP_SEARCH_MAX_RESULTS } from "@/lib/siglip-text-search-core";
import { toEnglishQuery, vocabularyPrompt } from "@/lib/search-query-english";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/search-probe";
const COMPARE_SIZE = 48;
type Params = { q?: string; cut?: string; view?: string; en?: string };
type Row = { id: string; thumb_url: string | null; src_url: string; distance: number };

/**
 * 검색어 하나로 SigLIP 이 고른 사진을 **유사도 순서 그대로** 늘어놓는다.
 *
 * 검색 화면은 앨범 흩뜨리기·세로 비율 맞추기로 순서를 바꾸고 점수를 숨긴다.
 * 여기서는 둘 다 걷어내, "몇 점부터 사람이 비슷하다고 느끼나" 를 눈으로 정하게 한다.
 * 사진을 누르면 그 점수가 기준선이 되고, 그 아래는 흐려진다.
 *
 * 비교 보기는 같은 검색어를 한국어 그대로 / qwen 영어 문구 / 무드 어휘 영어 문구로
 * 넣었을 때 상위 사진을 나란히 놓는다. SigLIP 은 영어 중심이라 한국어 한 단어를
 * 약하게 읽는다 — "노을" 은 한낮 골목길을 진짜 노을보다 위에 올렸다.
 */
export default async function SearchProbePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = (params.q ?? "노을").trim().slice(0, 60) || "노을";
  const cut = Number.isFinite(Number(params.cut)) && params.cut ? Number(params.cut) : null;
  const compare = params.view === "compare";
  const english = params.en === "1";
  const url = (changes: Params) =>
    `${BASE}?${new URLSearchParams(
      Object.entries({ q, view: compare ? "compare" : "", en: english ? "1" : "", ...changes }).filter(([, v]) => v),
    )}`;

  return (
    <section aria-labelledby="probe-heading">
      <h2 id="probe-heading" className="text-h2 font-semibold">검색 점수 보기</h2>
      <p className="mt-1 text-body-sm text-muted">
        검색 화면과 같은 SigLIP 결과를 <b className="text-fg">유사도 순서 그대로</b> 보여줍니다. 점수는 코사인 유사도입니다.{" "}
        <b className="text-fg">“여기까지가 비슷하다” 싶은 마지막 사진을 누르면</b> 그 점수가 기준선이 됩니다.
      </p>

      <form action={BASE} className="my-4 flex flex-wrap gap-2">
        <input key={`q-${q}`} name="q" defaultValue={q} maxLength={60} aria-label="검색어"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
        {compare && <input type="hidden" name="view" value="compare" />}
        {english && <input type="hidden" name="en" value="1" />}
        <button className="rounded-xl bg-fg px-5 py-2 text-bg">보기</button>
      </form>

      <nav aria-label="보기" className="mb-4 flex flex-wrap gap-2 text-body-sm">
        {[
          { label: "한국어 그대로", href: url({ view: "", en: "", cut: "" }), on: !compare && !english },
          { label: "영어로 바꿔서", href: url({ view: "", en: "1", cut: "" }), on: !compare && english },
          { label: "세 가지 나란히", href: url({ view: "compare", en: "", cut: "" }), on: compare },
        ].map((tab) => (
          <Link key={tab.label} href={tab.href} aria-current={tab.on ? "page" : undefined}
            className={`rounded-xl border px-4 py-2 ${tab.on ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
            {tab.label}
          </Link>
        ))}
      </nav>

      {compare ? <Compare q={q} /> : <Ranked q={q} english={english} cut={cut} url={url} />}
    </section>
  );
}

async function Ranked({ q, english, cut, url }: {
  q: string; english: boolean; cut: number | null; url: (c: Params) => string;
}) {
  const phrase = english ? await toEnglishQuery(q) : q;
  if (!phrase) return <Empty>qwen 이 영어 문구를 못 만들었습니다. ollama(11434)가 켜져 있는지 확인하세요.</Empty>;
  const rows = await probe(phrase);
  if (!rows.length) return <Empty>결과가 없습니다. 임베딩 서버(8077)가 켜져 있는지 확인하세요.</Empty>;

  const scores = rows.map((r) => 1 - r.distance);
  const top = scores[0];
  const kept = cut === null ? rows.length : scores.filter((s) => s >= cut).length;

  return (
    <>
      <p className="mb-4 text-body-sm">
        {english && <>SigLIP 에 넣은 문구 <b className="text-brand">“{phrase}”</b> · </>}
        상위 <b className="tabular-nums">{rows.length}</b>장 · 1위 <b className="tabular-nums">{top.toFixed(3)}</b> ·
        마지막 <b className="tabular-nums">{scores[scores.length - 1].toFixed(3)}</b>
        {cut !== null && (
          <>
            {" · "}<span className="text-brand">기준 <b className="tabular-nums">{cut.toFixed(3)}</b> 이상{" "}
            <b className="tabular-nums">{kept}</b>장 (1위의 {Math.round((cut / top) * 100)}%)</span>{" "}
            <Link href={url({ cut: "" })} className="text-muted underline hover:text-fg">기준 지우기</Link>
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
                  <Thumb row={row} />
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
  );
}

/** 같은 검색어를 세 가지로 넣어 상위를 나란히 — 어느 쪽이 사람 눈에 맞는지 한 화면에서 본다. */
async function Compare({ q }: { q: string }) {
  const [english, vocab] = await Promise.all([toEnglishQuery(q), vocabularyPrompt(q)]);
  const lanes: { title: string; phrase: string | null; note?: string }[] = [
    { title: "한국어 그대로", phrase: q, note: "지금 검색 화면" },
    { title: "qwen 영어 문구", phrase: english, note: english ? undefined : "qwen 응답 없음 — ollama 확인" },
    {
      title: "무드 어휘 영어 문구",
      phrase: vocab?.prompt ?? null,
      note: vocab ? `대표 “${vocab.head}”` : "어휘 사전에 없는 말",
    },
  ];
  const results = await Promise.all(lanes.map((lane) => (lane.phrase ? probe(lane.phrase) : Promise.resolve([]))));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {lanes.map((lane, i) => {
        const rows = results[i].slice(0, COMPARE_SIZE);
        return (
          <div key={lane.title} className="min-w-0 rounded-xl border border-line p-3">
            <p className="text-body-sm font-semibold">{lane.title}</p>
            <p className="mb-2 text-caption text-muted">
              {lane.phrase ? <>넣은 문구 <b className="text-fg">“{lane.phrase}”</b></> : null}
              {lane.note && <> {lane.phrase ? "· " : ""}{lane.note}</>}
            </p>
            {rows.length ? (
              <ol className="grid grid-cols-4 gap-1">
                {rows.map((row, rank) => (
                  <li key={row.id} title={`${rank + 1}위 · ${(1 - row.distance).toFixed(4)}`}>
                    <Thumb row={row} />
                    <span className="flex justify-between px-0.5 text-[10px] tabular-nums text-muted">
                      <span>#{rank + 1}</span><span>{(1 - row.distance).toFixed(3)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-8 text-center text-caption text-muted">결과 없음</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Thumb({ row }: { row: Row }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={row.thumb_url ?? row.src_url} alt="" loading="lazy" className="aspect-square w-full rounded object-cover" />;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-line p-8 text-center text-muted">{children}</p>;
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
async function probe(text: string): Promise<Row[]> {
  const vector = await embedSearchText(text).catch(() => null);
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

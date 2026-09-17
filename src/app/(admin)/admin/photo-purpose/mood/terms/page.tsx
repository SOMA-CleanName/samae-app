import Link from "next/link";
import { loadTermEdits, loadTermsBundle } from "@/lib/mood-terms-data";
import { AXES, AXIS_TONE } from "@/lib/mood-axes";
import { counts, FILTERS, resolveTerms, selectRows, touched, type Filter } from "@/lib/mood-terms";
import { TermControls, AddTerm } from "./TermControls";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/mood/terms";
const SIZE = 25;
type Params = { filter?: string; q?: string; axis?: string; page?: string };

export default async function MoodTermsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const filter = (FILTERS.some((f) => f.key === params.filter) ? params.filter : "odd") as Filter;
  const q = (params.q ?? "").trim().slice(0, 40);
  const axis = AXES.includes((params.axis ?? "") as (typeof AXES)[number]) ? params.axis! : "";
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page) || 1)));

  const [bundle, edits] = await Promise.all([loadTermsBundle(), loadTermEdits()]);
  const final = resolveTerms(bundle, edits);
  const seen = touched(edits);
  const tally = counts(bundle.rows, edits);
  const rows = selectRows(bundle.rows, { filter, q, axis, edits });
  const pages = Math.max(1, Math.ceil(rows.length / SIZE));
  const at = Math.min(page, pages);
  const shown = rows.slice((at - 1) * SIZE, at * SIZE);
  const url = (changes: Params) =>
    `${BASE}?${new URLSearchParams(Object.entries({ filter, q, axis, page: "1", ...changes }).filter(([, v]) => v))}`;

  const live = [...final.values()].reduce((sum, terms) => sum + terms.length, 0);

  return (
    <section aria-labelledby="terms-heading">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="terms-heading" className="text-h2 font-semibold">검색어 정리</h2>
        <Link href="/admin/photo-purpose/mood/axes" className="text-body-sm text-muted underline hover:text-fg">축 배정으로</Link>
      </div>
      <p className="mt-1 text-body-sm text-muted">
        사진은 늘 <b className="text-fg">“{"{무드}"} 사진”</b> 으로 찾습니다. 그래서 낱말을 사전형(조용하다)이 아니라
        검색 꼴(조용한)로 바꾸고, 묶음 안에서 <b className="text-fg">완전히 같은 말은 하나로 합쳤습니다.</b>{" "}
        결이 다른 것(고요한·잔잔한·차분한)은 각각 살렸습니다.{" "}
        낱말 {bundle.aliases.toLocaleString("ko-KR")}개가 흡수되고{" "}
        <b className="text-fg">검색어 {live.toLocaleString("ko-KR")}개</b>가 남았습니다.
      </p>
      <p className="mt-1 text-caption text-muted">
        버린 낱말은 사라지지 않고 <b className="text-fg">검색 별칭</b>으로 남습니다 — “깜빡거리다” 로 찾아도
        “깜박이는” 사진이 나와야 합니다. 고친 내용은 자동 생성분과 따로 쌓여 다시 정리해도 살아남습니다.
      </p>

      <nav aria-label="거르기" className="my-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={url({ filter: f.key })} aria-current={filter === f.key ? "page" : undefined}
            className={`rounded-xl border px-4 py-2.5 text-body-sm ${filter === f.key ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
            {f.label}
            <strong className="ml-2 tabular-nums">{tally[f.key].toLocaleString("ko-KR")}</strong>
          </Link>
        ))}
      </nav>

      <form action={BASE} className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="filter" value={filter} />
        {axis && <input type="hidden" name="axis" value={axis} />}
        <input key={`q-${q}`} name="q" defaultValue={q} maxLength={40} aria-label="검색어 찾기"
          placeholder="대표·검색어·흡수된 낱말·용례 아무거나" className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
        <button className="rounded-xl bg-fg px-5 py-2 text-bg">검색</button>
        {(q || axis) && <Link href={`${BASE}?filter=${filter}`} className="rounded-xl border border-line px-4 py-2 text-body-sm">초기화</Link>}
      </form>

      <p className="mb-4 text-body-sm text-muted">
        <b className="text-fg tabular-nums">{rows.length.toLocaleString("ko-KR")}</b>개 중{" "}
        <b className="text-fg tabular-nums">
          {((at - 1) * SIZE + 1).toLocaleString("ko-KR")}–{Math.min(at * SIZE, rows.length).toLocaleString("ko-KR")}
        </b>번째 · 손댄 묶음 {seen.size.toLocaleString("ko-KR")}개
      </p>

      {!shown.length && <p className="rounded-xl border border-line p-8 text-center text-muted">해당하는 묶음이 없습니다.</p>}

      <ul className="space-y-3">
        {shown.map((row) => {
          const terms = final.get(row.head) ?? [];
          const dropped = Object.keys(row.aliases).filter((w) => !terms.includes(w));
          return (
            <li key={row.head} className={`rounded-xl border p-4 ${seen.has(row.head) ? "border-brand/40 bg-brand/[0.03]" : "border-line"}`}>
              <div className="flex flex-wrap items-baseline gap-2">
                <strong className="text-body font-semibold">{row.head}</strong>
                {row.head in row.aliases && (
                  <span className="rounded-lg border border-amber-400 bg-amber-500/10 px-2 py-0.5 text-caption text-amber-700">
                    대표 바뀜 → {row.aliases[row.head]}
                  </span>
                )}
                {row.axes.map((name) => (
                  <Link key={name} href={url({ axis: name })}
                    className={`rounded-lg border px-2 py-0.5 text-caption ${AXIS_TONE[name] ?? "border-line"}`}>{name}</Link>
                ))}
                <span className="ml-auto text-caption text-muted">{row.usage}</span>
              </div>

              <ul className="mt-3 flex flex-wrap items-center gap-2">
                {terms.map((term) => (
                  <li key={term}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 ${row.odd.includes(term) ? "border-amber-400 bg-amber-500/10" : "border-line"}`}>
                    <b className="text-body-sm font-medium">{term}</b>
                    <TermControls head={row.head} term={term} />
                  </li>
                ))}
                {!terms.length && <li className="text-body-sm text-rose-700">검색어가 하나도 없습니다 — 아래에서 되살려 주세요.</li>}
              </ul>

              {dropped.length > 0 && (
                <p className="mt-2 text-caption text-muted">
                  흡수 {dropped.length}: {dropped.slice(0, 14).join(" · ")}{dropped.length > 14 && ` … 외 ${dropped.length - 14}개`}
                </p>
              )}
              {row.made_up.length > 0 && (
                <p className="mt-1 text-caption text-rose-700">모델이 지어내서 버림: {row.made_up.join(" · ")}</p>
              )}
              <AddTerm head={row.head} dropped={dropped} />
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <nav aria-label="검색어 페이지" className="mt-5 flex flex-wrap items-center justify-between gap-3 text-body-sm">
          {at > 1
            ? <Link href={url({ page: String(at - 1) })} className="rounded-xl border border-line px-4 py-2">이전</Link>
            : <span className="rounded-xl border border-line px-4 py-2 text-muted">이전</span>}
          <form action={BASE} className="flex items-center gap-2">
            <input type="hidden" name="filter" value={filter} />
            {q && <input type="hidden" name="q" value={q} />}
            {axis && <input type="hidden" name="axis" value={axis} />}
            <input key={`page-${at}`} name="page" defaultValue={String(at)} inputMode="numeric" aria-label="페이지 번호"
              className="w-20 rounded-xl border border-line bg-bg px-3 py-2 text-center tabular-nums" />
            <span className="text-muted tabular-nums">/ {pages.toLocaleString("ko-KR")}</span>
            <button className="rounded-xl border border-line px-3 py-2">이동</button>
          </form>
          {at < pages
            ? <Link href={url({ page: String(at + 1) })} className="rounded-xl border border-line px-4 py-2">다음</Link>
            : <span className="rounded-xl border border-line px-4 py-2 text-muted">다음</span>}
        </nav>
      )}
    </section>
  );
}

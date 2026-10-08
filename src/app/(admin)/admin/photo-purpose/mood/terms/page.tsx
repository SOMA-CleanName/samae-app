import Link from "next/link";
import { loadAxisBundle } from "@/lib/mood-axes-data";
import { loadTermEdits, loadTermsBundle } from "@/lib/mood-terms-data";
import { AXES, AXIS_BAR, AXIS_TONE } from "@/lib/mood-axes";
import { ALL_AXES, NO_AXIS, axisTally, representative, resolveTerms, selectRows } from "@/lib/mood-terms";
import { TermCard } from "./TermControls";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/mood/terms";
const SIZE = 25;
type Params = { q?: string; axis?: string; multi?: string; page?: string; view?: string };

/**
 * 검색어(D1) · 묶음(D2) — 사전 전체 갈래. 축 배정과 검색어 정리는 2026-09-19 에 한 화면으로 합쳤다.
 * 뎁스를 갈랐다(사람 요청 2026-09-29): `?view=terms` 는 **검색어 하나씩**(D1, 어느 묶음에 들었는지 함께), 기본은 **묶음 카드**(D2).
 * 두 번들의 묶음·축은 똑같다 — 따로 보면 같은 묶음을 두 번 훑게 된다.
 * 기본은 축 하나씩 나눠 본다. 한 묶음은 여러 축에 들 수 있어 축마다 한 번씩 나온다.
 */
export default async function MoodTermsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 60);
  const axis = params.axis === ALL_AXES || params.axis === NO_AXIS || AXES.includes((params.axis ?? "") as (typeof AXES)[number])
    ? params.axis!
    : AXES[0];
  const multi = params.multi === "1";
  const flat = params.view === "terms";                        // D1 검색어 하나씩 / 기본은 D2 묶음 카드
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page) || 1)));

  const [bundle, edits, axisBundle] = await Promise.all([loadTermsBundle(), loadTermEdits(), loadAxisBundle()]);
  const final = resolveTerms(bundle, edits);
  const prompts = new Map(axisBundle.groups.map((group) => [group.head, group.prompts]));
  const tally = axisTally(bundle.rows, final);
  const widest = Math.max(...[...tally.values()].map((t) => t.terms));

  const rows = selectRows(bundle.rows, { q, axis, multi, prompts });
  const url = (changes: Params) =>
    `${BASE}?${new URLSearchParams(Object.entries({ q, axis, multi: multi ? "1" : "", view: flat ? "terms" : "", page: "1", ...changes }).filter(([, v]) => v))}`;

  // 같은 검색어가 여러 묶음에 들어 있을 수 있다(조용한 → 조용하다·묵묵하다).
  // 칸 수를 그대로 세면 그만큼 부풀므로 서로 다른 검색어로 센다.
  const owners = new Map<string, number>();
  for (const terms of final.values()) for (const term of terms) owners.set(term, (owners.get(term) ?? 0) + 1);
  const shared = [...owners.values()].filter((n) => n > 1).length;
  // D1 — 검색어 하나씩. 같은 검색어가 여러 묶음에 걸쳐 있으면 그 묶음을 다 보여 준다(모아야 할 것이 눈에 띈다)
  const homes = new Map<string, string[]>();
  for (const row of rows) for (const term of final.get(row.head) ?? []) homes.set(term, [...(homes.get(term) ?? []), row.head]);
  const needle = q.trim();
  const termRows = !flat ? [] : [...homes.entries()]
    .filter(([term]) => !needle || term.includes(needle))
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ko"));
  const total = flat ? termRows.length : rows.length;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const at = Math.min(page, pages);
  const shown = rows.slice((at - 1) * SIZE, at * SIZE);
  const shownTerms = termRows.slice((at - 1) * SIZE, at * SIZE);
  const multiCount = bundle.rows.filter((row) => row.axes.length > 1).length;
  // 사전 거르기로 새로 들어온 낱말(docs/40 §17-3) — 아직 축이 없어 축 칸에는 안 나온다
  const unassigned = bundle.rows.filter((row) => row.axes.length === 0);
  const unsure = unassigned.filter((row) => row.sure === false).length;

  return (
    <section aria-labelledby="terms-heading">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="terms-heading" className="text-h2 font-semibold">{flat ? "검색어 — 사전 전체" : "묶음 — 사전 전체"}</h2>
      </div>
      <p className="mt-1 text-body-sm text-muted">
        무드 낱말 {axisBundle.words.toLocaleString("ko-KR")}개를 뜻이 같은 것끼리 묶어{" "}
        묶음 {bundle.rows.length.toLocaleString("ko-KR")}개로 줄이고, 묶음마다 축을 붙인 뒤{" "}
        <b className="text-fg">“{"{무드}"} 사진”</b> 으로 찾을 검색 꼴(조용하다 → 조용한)로 정리했습니다.{" "}
        <b className="text-fg">서로 다른 검색어 {owners.size.toLocaleString("ko-KR")}개</b>
        {shared > 0
          ? <> — 그중 {shared.toLocaleString("ko-KR")}개는 두 묶음 이상에 걸쳐 있습니다. 한 묶음으로 모아야 합니다.</>
          : <> — 검색어 하나는 한 묶음에만 있습니다.</>}
      </p>
      <p className="mt-1 text-caption text-muted">
        축은 서로 대등해서 한 묶음이 여러 축에 나옵니다. 버린 낱말은 <b className="text-fg">검색 별칭</b>으로 남습니다 —
        “깜빡거리다” 로 찾아도 “깜박이는” 사진이 나와야 합니다. DB에는 아직 반영하지 않았습니다.
      </p>

      {/* 축 12개 — 고르면 그 축의 묶음만 나온다. 막대는 검색어 수 비중이다. */}
      <ul className="my-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {AXES.map((name) => {
          const count = tally.get(name) ?? { groups: 0, terms: 0 };
          const active = axis === name;
          return (
            <li key={name}>
              <Link href={url({ axis: name })} aria-current={active ? "true" : undefined}
                className={`block rounded-xl border p-3 transition-colors ${active ? AXIS_TONE[name] : "border-line hover:border-fg/40"}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="text-body font-semibold">{name}</strong>
                  <span className="text-caption text-muted tabular-nums">
                    묶음 {count.groups.toLocaleString("ko-KR")} · 검색어 <b className="text-fg">{count.terms.toLocaleString("ko-KR")}</b>
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-fg/10" aria-hidden>
                  <div className={`h-full rounded-full ${AXIS_BAR[name]}`} style={{ width: `${Math.max(2, (count.terms / widest) * 100)}%` }} />
                </div>
              </Link>
            </li>
          );
        })}
        <li>
          <Link href={url({ axis: ALL_AXES })} aria-current={axis === ALL_AXES ? "true" : undefined}
            className={`flex h-full items-center justify-between gap-2 rounded-xl border p-3 transition-colors ${
              axis === ALL_AXES ? "border-brand bg-brand/10 text-brand" : "border-line hover:border-fg/40"}`}>
            <strong className="text-body font-semibold">전체</strong>
            <span className="text-caption text-muted tabular-nums">
              묶음 {bundle.rows.length.toLocaleString("ko-KR")} · 검색어 <b className="text-fg">{owners.size.toLocaleString("ko-KR")}</b>
            </span>
          </Link>
        </li>
        {unassigned.length > 0 && (
          <li className="sm:col-span-2 lg:col-span-4">
            <Link href={url({ axis: NO_AXIS })} aria-current={axis === NO_AXIS ? "true" : undefined}
              className={`flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-dashed p-3 transition-colors ${
                axis === NO_AXIS ? "border-brand bg-brand/10 text-brand" : "border-line hover:border-fg/40"}`}>
              <strong className="text-body font-semibold">축 없음 — 새로 들어온 무드</strong>
              <span className="text-caption text-muted tabular-nums">
                묶음 <b className="text-fg">{unassigned.length.toLocaleString("ko-KR")}</b> · 그중 판정이 애매했던 것{" "}
                {unsure.toLocaleString("ko-KR")} — 우리말샘까지 거른 새 낱말(한 낱말 = 한 묶음). 축 배정 · 묶기는 다음 단계
              </span>
            </Link>
          </li>
        )}
      </ul>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action={BASE} className="flex min-w-0 flex-1 flex-wrap gap-2">
          <input type="hidden" name="axis" value={axis} />
          {multi && <input type="hidden" name="multi" value="1" />}
          {flat && <input type="hidden" name="view" value="terms" />}
          <input key={`q-${q}`} name="q" defaultValue={q} maxLength={60} aria-label="검색어 찾기"
            placeholder="대표·검색어·흡수된 낱말·용례·영어 프롬프트 아무거나"
            className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
          <button className="rounded-xl bg-fg px-5 py-2 text-bg">검색</button>
        </form>
        <Link href={url({ multi: multi ? "" : "1" })} aria-pressed={multi}
          className={`rounded-xl border px-4 py-2 text-body-sm ${multi ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
          축 2개 이상만 <strong className="ml-1 tabular-nums">{multiCount.toLocaleString("ko-KR")}</strong>
        </Link>
        {(q || multi || axis !== AXES[0]) && (
          <Link href={flat ? `${BASE}?view=terms` : BASE} className="rounded-xl border border-line px-4 py-2 text-body-sm">초기화</Link>
        )}
      </div>

      <p className="mb-4 text-body-sm text-muted">
        <b className="text-fg">{axis === ALL_AXES || axis === NO_AXIS ? axis : `${axis} 축`}</b>{" "}
        <b className="text-fg tabular-nums">{total.toLocaleString("ko-KR")}</b>{flat ? "개 검색어" : "개 묶음"} 중{" "}
        <b className="text-fg tabular-nums">
          {total ? ((at - 1) * SIZE + 1).toLocaleString("ko-KR") : 0}–{Math.min(at * SIZE, total).toLocaleString("ko-KR")}
        </b>번째
      </p>

      {total === 0 && <p className="rounded-xl border border-line p-8 text-center text-muted">해당하는 {flat ? "검색어" : "묶음"}가 없습니다.</p>}

      {/* D1 — 검색어 하나씩. 두 묶음 이상에 걸친 것이 위로 온다 */}
      {flat && (
        <ul className="space-y-2">
          {shownTerms.map(([term, heads]) => (
            <li key={term} className="flex flex-wrap items-baseline gap-2 rounded-xl border border-line px-4 py-3">
              <b className="text-body font-medium">{term}</b>
              {heads.length > 1 && <span className="rounded border border-amber-500/40 px-1 text-caption text-amber-600">묶음 {heads.length}곳</span>}
              <span className="ml-auto flex flex-wrap items-baseline gap-2 text-caption text-muted">
                {heads.map((h) => (
                  <Link key={h} href={url({ view: "", q: h, axis: ALL_AXES })} className="underline-offset-2 hover:underline">{h}</Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!flat && (
      <ul className="space-y-3">
        {shown.map((row) => {
          const terms = final.get(row.head) ?? [];
          const dropped = Object.keys(row.aliases).filter((w) => !terms.includes(w));
          return (
            <TermCard key={row.head} head={row.head} title={representative(row, terms)}
              axes={row.axes.map((name) => ({ name, href: url({ axis: name }), tone: AXIS_TONE[name] ?? "border-line" }))}
              usage={row.usage} prompts={prompts.get(row.head) ?? []}
              terms={terms} dropped={dropped} madeUp={row.made_up} />
          );
        })}
      </ul>
      )}

      {pages > 1 && (
        <nav aria-label="검색어 페이지" className="mt-5 flex flex-wrap items-center justify-between gap-3 text-body-sm">
          {at > 1
            ? <Link href={url({ page: String(at - 1) })} className="rounded-xl border border-line px-4 py-2">이전</Link>
            : <span className="rounded-xl border border-line px-4 py-2 text-muted">이전</span>}
          <form action={BASE} className="flex items-center gap-2">
            {q && <input type="hidden" name="q" value={q} />}
            <input type="hidden" name="axis" value={axis} />
            {multi && <input type="hidden" name="multi" value="1" />}
            {flat && <input type="hidden" name="view" value="terms" />}
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

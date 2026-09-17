import Link from "next/link";
import { redirect } from "next/navigation";
import { loadAxisBundle } from "@/lib/mood-axes-data";
import { AXES, AXIS_BAR, AXIS_TONE, axisSpread, selectGroups, wordCount } from "@/lib/mood-axes";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/mood/axes";
const SIZE = 30;
const MEMBERS_SHOWN = 12;   // 식구가 24개인 묶음도 있다. 접어 두고 펼쳐 보게 한다.
type Params = { axis?: string; q?: string; multi?: string; page?: string };

export default async function MoodAxesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const axis = AXES.includes((params.axis ?? "") as (typeof AXES)[number]) ? params.axis! : "";
  const q = (params.q ?? "").trim().slice(0, 60);
  const multi = params.multi === "1";
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page) || 1)));

  const bundle = await loadAxisBundle();
  const filtered = selectGroups(bundle.groups, { axis, q, multi });
  const pages = Math.max(1, Math.ceil(filtered.length / SIZE));
  const url = (changes: Params) =>
    `${BASE}?${new URLSearchParams(Object.entries({ axis, q, multi: multi ? "1" : "", page: "1", ...changes }).filter(([, v]) => v))}`;
  if (page > pages) redirect(url({ page: String(pages) }));
  const shown = filtered.slice((page - 1) * SIZE, page * SIZE);

  const words = wordCount(filtered);
  const spread = axisSpread(bundle.groups);
  const multiHeads = spread.filter(([count]) => count > 1).reduce((sum, [, heads]) => sum + heads, 0);
  const widest = Math.max(...Object.values(bundle.per_axis).map((t) => t.words));

  return (
    <section aria-labelledby="axes-heading">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="axes-heading" className="text-h2 font-semibold">축 배정</h2>
        <Link href="/admin/photo-purpose/mood" className="text-body-sm text-muted underline hover:text-fg">무드 목록으로</Link>
      </div>
      <p className="mt-1 text-body-sm text-muted">
        무드 낱말 {bundle.words.toLocaleString("ko-KR")}개를 뜻이 같은 것끼리 묶어 대표 {bundle.heads.toLocaleString("ko-KR")}개로 줄이고,
        그 대표에 축을 붙인 결과입니다. <b className="text-fg">축은 서로 대등해서 한 낱말이 여러 축에 들어갑니다.</b>{" "}
        식구는 대표를 따라갑니다. <b className="text-fg">DB에는 아직 반영하지 않았습니다.</b>
      </p>

      {/* 축 11개 — 낱말 수 비중이 막대로 보인다. 감정이 41.7% 로 쏠려 있다는 게 한눈에 드러나야 한다. */}
      <ul className="my-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {AXES.map((name) => {
          const tally = bundle.per_axis[name] ?? { heads: 0, words: 0 };
          const share = (tally.words / bundle.words) * 100;
          const active = axis === name;
          return (
            <li key={name}>
              <Link href={url({ axis: active ? "" : name })} aria-current={active ? "true" : undefined}
                className={`block rounded-xl border p-3 transition-colors ${active ? AXIS_TONE[name] : "border-line hover:border-fg/40"}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="text-body font-semibold">{name}</strong>
                  <span className="text-caption text-muted tabular-nums">
                    대표 {tally.heads.toLocaleString("ko-KR")} · 낱말 <b className="text-fg">{tally.words.toLocaleString("ko-KR")}</b>
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-fg/10" aria-hidden>
                  <div className={`h-full rounded-full ${AXIS_BAR[name]}`} style={{ width: `${Math.max(2, (tally.words / widest) * 100)}%` }} />
                </div>
                <p className="mt-1 text-caption text-muted tabular-nums">{share.toFixed(1)}%</p>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action={BASE} className="flex min-w-0 flex-1 flex-wrap gap-2">
          <input type="hidden" name="axis" value={axis} />
          {multi && <input type="hidden" name="multi" value="1" />}
          <input key={`q-${q}`} name="q" defaultValue={q} maxLength={60} aria-label="낱말·영어 프롬프트 검색"
            placeholder="낱말이나 영어 프롬프트로 검색" className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
          <button className="rounded-xl bg-fg px-5 py-2 text-bg">검색</button>
        </form>
        <Link href={url({ multi: multi ? "" : "1" })} aria-pressed={multi}
          className={`rounded-xl border px-4 py-2 text-body-sm ${multi ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
          축 2개 이상만 <strong className="ml-1 tabular-nums">{multiHeads.toLocaleString("ko-KR")}</strong>
        </Link>
        <Link href={BASE} className="rounded-xl border border-line px-4 py-2 text-body-sm">초기화</Link>
      </div>

      <p className="mb-3 text-caption text-muted">
        {axis ? <><b className="text-fg">{axis}</b> 축 </> : "전체 "}
        묶음 {filtered.length.toLocaleString("ko-KR")}개 · 낱말 {words.toLocaleString("ko-KR")}개 · 식구 많은 순
        {!axis && !q && !multi && <> · 축 개수 {spread.map(([n, c]) => `${n}개 ${c.toLocaleString("ko-KR")}`).join(" · ")}</>}
      </p>

      <ul className="space-y-3">
        {shown.map((group) => (
          <li key={group.head} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className="text-body font-semibold">{group.head}</strong>
              {group.axes.map((name) => (
                <Link key={name} href={url({ axis: name })}
                  className={`rounded-lg border px-2 py-0.5 text-caption ${AXIS_TONE[name]}`}>{name}</Link>
              ))}
              <span className="text-caption text-muted">식구 {group.members.length}</span>
              <span className="ml-auto text-caption text-muted">{group.prompts.join(" / ")}</span>
            </div>
            <p className="mt-2 text-body-sm">{group.usage}</p>
            {group.members.length > 0 && (
              group.members.length <= MEMBERS_SHOWN
                ? <p className="mt-2 text-body-sm text-muted">{group.members.join(" · ")}</p>
                : <details className="mt-2">
                    <summary className="cursor-pointer text-body-sm text-muted">
                      {group.members.slice(0, MEMBERS_SHOWN).join(" · ")}
                      <span className="text-fg"> … 외 {group.members.length - MEMBERS_SHOWN}개</span>
                    </summary>
                    <p className="mt-2 text-body-sm text-muted">{group.members.join(" · ")}</p>
                  </details>
            )}
          </li>
        ))}
      </ul>
      {!filtered.length && <p className="rounded-xl border border-line p-8 text-center text-muted">해당하는 묶음이 없습니다.</p>}

      <nav aria-label="축 배정 페이지" className="mt-5 flex items-center justify-between text-body-sm">
        {page > 1 ? <Link href={url({ page: String(page - 1) })}>이전</Link> : <span className="text-muted">이전</span>}
        <span>{page} / {pages}</span>
        {page < pages ? <Link href={url({ page: String(page + 1) })}>다음</Link> : <span className="text-muted">다음</span>}
      </nav>
    </section>
  );
}

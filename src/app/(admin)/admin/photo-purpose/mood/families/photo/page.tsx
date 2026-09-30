import Link from "next/link";
import { AXES, AXIS_TONE } from "@/lib/mood-axes";
import { familyLabel, moodTally, noteFor, selectFamilies, type PhotoFamily } from "@/lib/mood-photo-families";
import { loadPhotoClusters, loadPhotoFamilies, loadPhotoFamilyNotes, loadPhotoNeighborBundle } from "@/lib/mood-photo-layers-data";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/mood/families/photo";
type Params = { q?: string; big?: string; axis?: string; view?: string };

/**
 * 가족(D4) · 큰 무드(D5) — 사진 무드 표현 (docs/40 §16-1 · §16-2 · §17-5, 2026-09-29).
 * 뎁스를 갈랐다(사람 요청): `?view=big` 은 **큰 무드 하나씩**(D5), 기본은 **가족**(D4).
 * 이웃 그래프를 무게 주어 뭉친 덩어리다. 가족에는 대표도 이름도 없다 — 번호와 식구 묶음, 그리고 "무엇을 기준으로 묶였나" 를 적은 글뿐이다
 * (사람 결정, 2026-09-30: 이름을 붙이지 않는다. 글은 mood-edits/photo-family-notes.json).
 * 축은 가족을 정하는 데 쓰지 않았다(§16-2 4번). 든 묶음의 축을 세어 보여 줄 뿐이다. 다시 뭉치려면 build_photo_families.py.
 */
export default async function MoodPhotoFamiliesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 60);
  const big2 = params.view === "big";                       // D5 큰 무드 하나씩 / 기본은 D4 가족
  const [data, allNotes, bundle, clusters] = await Promise.all([
    loadPhotoFamilies(), loadPhotoFamilyNotes(), loadPhotoNeighborBundle(), loadPhotoClusters(),
  ]);

  const head = (
    <div className="flex flex-wrap items-baseline gap-3">
      <h2 id="photo-families-heading" className="text-h2 font-semibold">{big2 ? "큰 무드 — 사진 무드 표현" : "가족 — 사진 무드 표현"}</h2>
    </div>
  );

  if (!data) {
    return (
      <section aria-labelledby="photo-families-heading">
        {head}
        <p className="mt-6 rounded-xl border border-line p-8 text-center text-muted">
          아직 뭉치지 않았습니다 — <code className="text-fg">py build_photo_families.py</code> 를 돌리면 이웃 그래프에서 가족이 나옵니다.
        </p>
      </section>
    );
  }

  const notes = allNotes.families;
  const big = data.moods.some((m) => m.id === params.big) ? params.big! : "";
  const axis = AXES.includes((params.axis ?? "") as (typeof AXES)[number]) ? params.axis! : "";
  const rows = selectFamilies(data.families, notes, { q, big, axis });
  const url = (changes: Params) => `${BASE}?${new URLSearchParams(Object.entries({ q, big, axis, ...changes }).filter(([, v]) => v))}`;

  const moods = moodTally(data);
  const groups = data.families.reduce((n, f) => n + f.members.length, 0);
  const terms = data.families.reduce((n, f) => n + f.terms, 0);
  const noted = data.families.filter((f) => noteFor(f, notes)).length;
  const byId = new Map(data.families.map((f) => [f.id, f]));
  const inCluster = new Map<string, string[]>();
  for (const c of clusters?.clusters ?? []) for (const m of c.members) inCluster.set(m, c.members.filter((x) => x !== m));

  return (
    <section aria-labelledby="photo-families-heading">
      {head}
      <p className="mt-1 text-body-sm text-muted">
        {big2
          ? <>가족 {data.families.length}개를 가족끼리의 무게로 한 번 더 뭉친 <b className="text-fg">큰 무드 {data.moods.length}개</b>입니다 — 가족이 통째로 들어가 층이 어긋나지 않습니다.
            기준은 &ldquo;같은 칸에 놓여도 납득되고, 사진에서 눈으로 구분된다&rdquo; 입니다. 이름 대신 무엇으로 묶였는지 글로 적었습니다.</>
          : <>이웃 그래프(묶음 {groups.toLocaleString("ko-KR")} · 검색어 {terms.toLocaleString("ko-KR")})를 무게 주어 뭉친 <b className="text-fg">가족 {data.families.length}개</b>입니다 —
            판정이 셀수록, 벡터가 가까울수록 무겁게 하고 이웃이 많은 묶음은 낮췄습니다. 같은 무리는 늘 한 가족에 남습니다.
            가족은 축과 상관없이 뭉칩니다 — 축은 결과로 따라와 세어 보여 줄 뿐입니다.</>}
      </p>
      <p className="mt-1 text-caption text-muted">
        가족에는 대표도 이름도 없습니다. 번호와 식구 묶음, 그리고 <b className="text-fg">무엇을 기준으로 묶였는지 적은 글</b>뿐입니다
        ({noted}/{data.families.length}개 — mood-edits/photo-family-notes.json, Claude 가 식구를 보고 적은 것이라 사람 확인 전입니다).
        손님은 다른 가족에 살면서 이 가족에도 제 무게의 {Math.round((data.weights["손님 문턱"] ?? 0.3) * 100)}% 이상 걸친 묶음입니다(부모는 여럿). {data.made_at} 뭉침 · 해상도 {data.resolution} · 큰 무드 {data.big_resolution}. DB 에는 반영하지 않았습니다.
      </p>

      {/* D5 — 큰 무드 하나씩. 가족 칩을 누르면 그 큰 무드의 가족만 본다 */}
      {big2 && (
        <ul className="mt-5 space-y-3">
          {moods.map((m) => {
            const inside = (data.moods.find((x) => x.id === m.id)?.families ?? []).map((id) => byId.get(id)).filter((f): f is PhotoFamily => !!f);
            const axes = new Map<string, number>();
            for (const f of inside) for (const [a, n] of f.axes) axes.set(a, (axes.get(a) ?? 0) + n);
            return (
              <li key={m.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <strong className="text-body font-semibold">{familyLabel({ id: m.id })}</strong>
                  {[...axes].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, n]) => (
                    <span key={name} className={`rounded-lg border px-2 py-0.5 text-caption ${AXIS_TONE[name] ?? "border-line"}`}>{name} {n}</span>
                  ))}
                  <span className="ml-auto text-caption text-muted tabular-nums">가족 {m.families} · 묶음 {m.groups} · 검색어 {m.terms}</span>
                </div>
                <FamilyNote found={noteFor({ members: inside.flatMap((f) => f.members) }, allNotes.moods)} />
                <ul className="mt-3 flex flex-wrap items-center gap-2">
                  {inside.map((f) => (
                    <li key={f.id}>
                      <Link href={`${BASE}?big=${m.id}&q=${encodeURIComponent(f.members[0] ?? "")}`}
                        className="flex items-baseline gap-1.5 rounded-xl border border-line px-3 py-1.5 hover:border-fg/40"
                        title={noteFor(f, notes)?.note ?? f.members.slice(0, 8).join(" · ")}>
                        <b className="text-body-sm font-medium">{familyLabel(f)}</b>
                        <span className="text-caption text-muted">{f.members.slice(0, 3).join(" · ")}</span>
                        <span className="text-caption text-muted tabular-nums">{f.members.length}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-3">
                  <Link href={url({ big: m.id, view: "" })} className="text-caption text-muted underline-offset-2 hover:underline">이 큰 무드의 가족 보기 →</Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {!big2 && (
      <>
      <div className="mb-4 mt-5 flex flex-wrap items-center gap-2">
        <form action={BASE} className="flex min-w-0 flex-1 flex-wrap gap-2">
          {big && <input type="hidden" name="big" value={big} />}
          {axis && <input type="hidden" name="axis" value={axis} />}
          <input key={`q-${q}`} name="q" defaultValue={q} maxLength={60} aria-label="가족 찾기" placeholder="묶음 이름 · 가족 글"
            className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
          <button className="rounded-xl bg-fg px-5 py-2 text-bg">검색</button>
        </form>
        {(q || big || axis) && <Link href={BASE} className="rounded-xl border border-line px-4 py-2 text-body-sm">초기화</Link>}
      </div>

      <nav aria-label="축으로 좁히기" className="mb-5 flex flex-wrap gap-2">
        {AXES.map((name) => (
          <Link key={name} href={url({ axis: axis === name ? "" : name })} aria-current={axis === name ? "true" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-caption ${axis === name ? AXIS_TONE[name] : "border-line text-muted hover:text-fg"}`}>{name}</Link>
        ))}
      </nav>

      <p className="mb-4 text-body-sm text-muted">
        <b className="text-fg tabular-nums">{rows.length}</b>개 가족 · 식구 많은 순
        {big && <> · 큰 무드 {big.toUpperCase()}</>}{axis && <> · {axis} 축이 든 가족</>}
      </p>

      {rows.length === 0 && <p className="rounded-xl border border-line p-8 text-center text-muted">해당하는 가족이 없습니다.</p>}

      <ul className="space-y-3">
        {rows.map((f) => (
          <li key={f.id} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className="text-body font-semibold">{familyLabel(f)}</strong>
              <Link href={url({ big: f.big })} className="rounded-lg border border-line px-2 py-0.5 text-caption text-muted hover:text-fg">{f.big.toUpperCase()}</Link>
              {f.axes.slice(0, 4).map(([name, n]) => (
                <Link key={name} href={url({ axis: name })} className={`rounded-lg border px-2 py-0.5 text-caption ${AXIS_TONE[name] ?? "border-line"}`}>{name} {n}</Link>
              ))}
              <span className="ml-auto text-caption text-muted tabular-nums">묶음 {f.members.length} · 검색어 {f.terms}</span>
            </div>

            <FamilyNote found={noteFor(f, notes)} />

            <ul className="mt-3 flex flex-wrap items-center gap-2">
              {f.members.map((m) => (
                <li key={m} className="flex items-baseline gap-1.5 rounded-xl border border-line px-3 py-1.5"
                  title={[bundleUsage(bundle, m), (bundle?.nodes?.[m]?.members ?? []).join(" · ")].filter(Boolean).join(" — ")}>
                  <b className="text-body-sm font-medium">{m}</b>
                  {inCluster.has(m) && <span className="text-caption text-brand" title={`무리: ${inCluster.get(m)!.join(" · ")}`}>≈</span>}
                  <span className="text-caption text-muted tabular-nums">{(bundle?.nodes?.[m]?.members ?? []).length || 1}</span>
                </li>
              ))}
            </ul>

            {f.guests.length > 0 && (
              <p className="mt-2 text-caption text-muted">
                손님{" "}
                {f.guests.slice(0, 8).map((g) => (
                  <span key={g.head} className="mr-2">
                    {g.head}
                    <Link href={url({ q: byId.get(g.home)?.members[0] ?? "" })} className="ml-1 text-muted/70 underline-offset-2 hover:underline">
                      {familyLabel({ id: g.home })}
                    </Link>
                    <span className="ml-1 tabular-nums text-muted/60">{Math.round(g.share * 100)}%</span>
                  </span>
                ))}
                {f.guests.length > 8 && <span className="text-muted/60">외 {f.guests.length - 8}</span>}
              </p>
            )}
          </li>
        ))}
      </ul>
      </>
      )}
    </section>
  );
}

const bundleUsage = (bundle: { nodes?: Record<string, { usage?: string }> } | null, head: string) => bundle?.nodes?.[head]?.usage ?? "";

/** 무엇을 기준으로 묶였나 — 이름 대신 글. 식구가 바뀌었으면 옛 식구 기준이라고 알린다 */
function FamilyNote({ found }: { found: { note: string; changed: boolean } | null }) {
  if (!found) return <p className="mt-2 text-body-sm text-muted">아직 글이 없습니다 — 다시 뭉치며 식구가 많이 바뀌었습니다.</p>;
  return (
    <p className="mt-2 text-body-sm leading-relaxed">
      {found.note}
      {found.changed && <span className="ml-1 text-caption text-muted">(글을 적은 뒤 식구가 바뀌었습니다)</span>}
    </p>
  );
}

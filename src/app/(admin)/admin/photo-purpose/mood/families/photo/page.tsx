import Link from "next/link";
import { Fragment } from "react";
import { AXES, AXIS_TONE } from "@/lib/mood-axes";
import { clustersIn, familyLabel, layerNameFor, moodTally, noteFor, selectFamilies, type PhotoFamily } from "@/lib/mood-photo-families";
import {
  loadFamilyPromptDrafts, loadFamilyPromptEdits, loadFamilyPromptKoDrafts, loadFamilyPromptKoEdits, loadPhotoClusters, loadPhotoFamilies, loadPhotoFamilyNames, loadPhotoFamilyNotes,
  loadPhotoMoodLayers, loadPhotoMoodNames, loadPhotoNeighborBundle,
} from "@/lib/mood-photo-layers-data";
import { familyKoFor, familyPromptsFor, v1KeyFor } from "@/lib/mood-photo-tags";
import { saveFamilyPrompts, translateFamilyPrompts } from "../../../tags/actions";
import { nameBigMood, nameFamily } from "./actions";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/mood/families/photo";
type Params = { q?: string; big?: string; axis?: string; view?: string };

/**
 * 가족(D4) · 큰 무드(D5) — 사진 무드 표현 (docs/40 §16-1 · §16-2 · §17-5, 2026-09-29).
 * 뎁스를 갈랐다(사람 요청): `?view=big` 은 **큰 무드 하나씩**(D5), 기본은 **가족**(D4).
 * 이웃 그래프를 무게 주어 뭉친 덩어리다. 가족에는 대표도 이름도 없다 — 번호와 식구 묶음, 그리고 "무엇을 기준으로 묶였나" 를 적은 글뿐이다
 * (사람 결정, 2026-09-30: 이름을 붙이지 않는다. 글은 mood-edits/photo-family-notes.json).
 * 이름(2026-10-01) — 큰 무드는 사람이 짓고(photo-mood-names.jsonl), 가족은 Claude 가 임시로 지은 것을 사람이 고친다(photo-family-names.jsonl).
 * 둘 다 번호가 아니라 식구 묶음과 함께 남아 다시 뭉쳐도 따라간다.
 * 축은 가족을 정하는 데 쓰지 않았다(§16-2 4번). 든 묶음의 축을 세어 보여 줄 뿐이다. 다시 뭉치려면 build_photo_families.py.
 */
export default async function MoodPhotoFamiliesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 60);
  const big2 = params.view === "big";                       // D5 큰 무드 하나씩 / 기본은 D4 가족
  const [data, allNotes, bundle, clusters, moodNames, familyNames, tagLayers, promptDrafts, promptEdits, koDrafts, koEdits] = await Promise.all([
    loadPhotoFamilies(), loadPhotoFamilyNotes(), loadPhotoNeighborBundle(), loadPhotoClusters(), loadPhotoMoodNames(), loadPhotoFamilyNames(),
    loadPhotoMoodLayers(), loadFamilyPromptDrafts(), loadFamilyPromptEdits(), loadFamilyPromptKoDrafts(), loadFamilyPromptKoEdits(),
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
  const url = (changes: Params) => `${BASE}?${new URLSearchParams(Object.entries({ q, big, axis, ...changes }).filter(([, v]) => v))}`;

  const moods = moodTally(data);
  const groups = data.families.reduce((n, f) => n + f.members.length, 0);
  const terms = data.families.reduce((n, f) => n + f.terms, 0);
  const noted = data.families.filter((f) => noteFor(f, notes)).length;
  const byId = new Map(data.families.map((f) => [f.id, f]));
  // 큰 무드의 식구 묶음 — 이름 · 글을 번호가 아니라 식구로 짝짓는다
  const moodMembers = new Map(data.moods.map((m) => [m.id, m.families.flatMap((id) => byId.get(id)?.members ?? [])]));
  const moodName = (id: string) => layerNameFor({ members: moodMembers.get(id) ?? [] }, moodNames);
  const familyName = (f: PhotoFamily) => layerNameFor(f, familyNames);
  const familyTitle = (f: PhotoFamily) => familyName(f)?.name ?? familyLabel(f);
  const draftNames = data.families.filter((f) => familyName(f)?.draft).length;
  const rows = selectFamilies(data.families, notes, { q, big, axis }, (f) => familyName(f)?.name ?? "");
  const drafted = data.moods.filter((m) => moodName(m.id)?.draft).length;
  const held = data.families.filter((f) => !f.big);                // 큰 무드에서 잠시 뺀 가족(사람 결정 2026-10-04: 저대비)
  const bigTitle = (id: string) => (id ? moodName(id)?.name ?? id.toUpperCase() : "보류");
  const moodOrder = new Map(data.moods.map((m, i) => [m.id, i]));
  const inCluster = new Map<string, string[]>();
  for (const c of clusters?.clusters ?? []) for (const m of c.members) inCluster.set(m, c.members.filter((x) => x !== m));

  return (
    <section aria-labelledby="photo-families-heading">
      {head}
      <p className="mt-1 text-body-sm text-muted">
        {big2
          ? <>가족 {data.families.length}개를 <b className="text-fg">말 · 검색 의도로</b> 다시 묶은 <b className="text-fg">큰 무드 {data.moods.length}개</b>입니다(2026-10-04) — 사진이 닮았는지가 아니라
            &ldquo;이 무드를 찾는 사람이 함께 바라는 분위기&rdquo; 로 묶었습니다(비 오는 날 → 고요한 · 차분한). 가족이 통째로 들어가 층이 어긋나지 않습니다.
            <b className="text-fg">이름은 Claude 임시</b>({drafted}/{data.moods.length}개 — 카드 아래 이름 칸에서 고치면 사람 이름이 됩니다). 큰 무드 없이 보류한 가족 {held.length}개는 맨 아래.</>
          : <>이웃 그래프(묶음 {groups.toLocaleString("ko-KR")} · 검색어 {terms.toLocaleString("ko-KR")})를 무게 주어 뭉친 <b className="text-fg">가족 {data.families.length}개</b>입니다 —
            판정이 셀수록, 벡터가 가까울수록 무겁게 하고 이웃이 많은 묶음은 낮췄습니다. 같은 무리는 늘 한 가족에 남습니다.
            가족은 축과 상관없이 뭉칩니다 — 축은 결과로 따라와 세어 보여 줄 뿐입니다.</>}
      </p>
      <p className="mt-1 text-caption text-muted">
        가족에는 대표가 없습니다. <b className="text-fg">이름은 Claude 가 임시로 지었습니다</b>(임시 {draftNames}/{data.families.length}개 — 카드 아래 이름 칸에서 고치면 사람 이름이 됩니다).
        그리고 <b className="text-fg">무엇을 기준으로 묶였는지 적은 글</b>이 있습니다
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
                  <strong className="text-body font-semibold">{moodName(m.id)?.name ?? familyLabel({ id: m.id })}</strong>
                  {moodName(m.id) && <span className="text-caption text-muted">{familyLabel({ id: m.id })}</span>}
                  {moodName(m.id)?.draft && <span className="rounded-lg border border-line px-2 py-0.5 text-caption text-muted">임시</span>}
                  {moodName(m.id)?.changed && <span className="text-caption text-muted">(이름을 붙인 뒤 식구가 바뀌었습니다)</span>}
                  {[...axes].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, n]) => (
                    <span key={name} className={`rounded-lg border px-2 py-0.5 text-caption ${AXIS_TONE[name] ?? "border-line"}`}>{name} {n}</span>
                  ))}
                  <span className="ml-auto text-caption text-muted tabular-nums">가족 {m.families} · 묶음 {m.groups} · 검색어 {m.terms}</span>
                </div>
                <FamilyNote found={noteFor({ members: moodMembers.get(m.id) ?? [] }, allNotes.moods)} />
                {/* 가족마다 든 무리(D3) — 같은 무리는 ≈ 로 이은 한 칸, 무리에 안 든 묶음은 혼자 한 칸 */}
                <ul className="mt-3 space-y-2">
                  {inside.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-baseline gap-1.5">
                      <Link href={`${BASE}?big=${m.id}&q=${encodeURIComponent(f.members[0] ?? "")}`}
                        className="mr-1 rounded-xl border border-fg/30 px-3 py-1 text-body-sm font-semibold hover:border-fg/60"
                        title={noteFor(f, notes)?.note ?? ""}>
                        {familyTitle(f)} <span className="text-caption font-normal tabular-nums text-muted">{familyLabel(f)}</span>
                      </Link>
                      <MemberClusters members={f.members} clusters={clusters?.clusters ?? []} />
                    </li>
                  ))}
                </ul>
                <form action={nameBigMood} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <input key={`${m.id}-${moodName(m.id)?.name ?? ""}`} name="name" defaultValue={moodName(m.id)?.name ?? ""} maxLength={30}
                    aria-label={`${familyLabel({ id: m.id })} 큰 무드 이름`} placeholder="이름 짓기"
                    className="w-56 rounded-xl border-2 border-danger bg-bg px-3 py-1.5 text-body-sm" />
                  <button className="rounded-xl border border-line px-3 py-1.5 text-body-sm hover:border-fg/40">저장</button>
                  <span className="text-caption text-muted">비우고 저장하면 이름을 지웁니다</span>
                  <Link href={url({ big: m.id, view: "" })} className="ml-auto text-caption text-muted underline-offset-2 hover:underline">이 큰 무드의 가족 보기 →</Link>
                </form>
              </li>
            );
          })}
          {held.length > 0 && (
            <li className="rounded-xl border border-dashed border-line p-4">
              <strong className="text-body font-semibold">보류</strong>
              <span className="ml-2 text-caption text-muted">큰 무드에 넣지 않고 잠시 뺀 가족 — 사진 태그의 큰 무드도 물려받지 않습니다</span>
              <ul className="mt-3 flex flex-wrap items-center gap-2">
                {held.map((f) => (
                  <li key={f.id}>
                    <Link href={`${BASE}?q=${encodeURIComponent(f.members[0] ?? "")}`} className="flex items-baseline gap-1.5 rounded-xl border border-line px-3 py-1.5 hover:border-fg/40">
                      <b className="text-body-sm font-medium">{familyTitle(f)}</b>
                      <span className="text-caption text-muted">{f.members.slice(0, 3).join(" · ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}

      {!big2 && (
      <>
      <div className="mb-4 mt-5 flex flex-wrap items-center gap-2">
        <form action={BASE} className="flex min-w-0 flex-1 flex-wrap gap-2">
          {big && <input type="hidden" name="big" value={big} />}
          {axis && <input type="hidden" name="axis" value={axis} />}
          <input key={`q-${q}`} name="q" defaultValue={q} maxLength={60} aria-label="가족 찾기" placeholder="가족 이름 · 묶음 이름 · 가족 글"
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
        <b className="text-fg tabular-nums">{rows.length}</b>개 가족 · 큰 무드 순으로 묶어 봅니다
        {big && <> · 큰 무드 {bigTitle(big)}</>}{axis && <> · {axis} 축이 든 가족</>}
      </p>

      {rows.length === 0 && <p className="rounded-xl border border-line p-8 text-center text-muted">해당하는 가족이 없습니다.</p>}

      <ul className="space-y-3">
        {[...rows].sort((a, b) => (moodOrder.get(a.big) ?? 999) - (moodOrder.get(b.big) ?? 999)).map((f, i, all) => (
          <Fragment key={f.id}>
          {(i === 0 || all[i - 1].big !== f.big) && (
            <li className="pt-4 first:pt-0">
              <div className="flex flex-wrap items-baseline gap-2 border-b border-line pb-1.5">
                <h3 className="text-h3 font-semibold">{bigTitle(f.big)}</h3>
                {f.big && moodName(f.big)?.draft && <span className="text-caption text-muted">임시 이름</span>}
                <span className="text-caption text-muted">{all.filter((x) => x.big === f.big).length}개 가족</span>
                <span className="text-body-sm text-muted">{f.big ? noteFor({ members: moodMembers.get(f.big) ?? [] }, allNotes.moods)?.note : "큰 무드에서 잠시 뺀 가족"}</span>
              </div>
              {f.big && (
                <form action={nameBigMood} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={f.big} />
                  <input key={`${f.big}-${moodName(f.big)?.name ?? ""}`} name="name" defaultValue={moodName(f.big)?.name ?? ""} maxLength={30}
                    aria-label={`${f.big.toUpperCase()} 큰 무드 이름`} placeholder="이름 짓기"
                    className="w-56 rounded-xl border-2 border-danger bg-bg px-3 py-1.5 text-body-sm" />
                  <button className="rounded-xl border border-line px-3 py-1.5 text-body-sm hover:border-fg/40">큰 무드 이름 저장</button>
                </form>
              )}
            </li>
          )}
          <li className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className="text-body font-semibold">{familyTitle(f)}</strong>
              {familyName(f) && <span className="text-caption text-muted">{familyLabel(f)}</span>}
              {familyName(f)?.draft && <span className="rounded-lg border border-line px-2 py-0.5 text-caption text-muted">임시</span>}
              {familyName(f)?.changed && <span className="text-caption text-muted">(이름을 붙인 뒤 식구가 바뀌었습니다)</span>}
              {f.big
                ? <Link href={url({ big: f.big })} className="rounded-lg border border-line px-2 py-0.5 text-caption text-muted hover:text-fg">{bigTitle(f.big)}</Link>
                : <span className="rounded-lg border border-dashed border-line px-2 py-0.5 text-caption text-muted">큰 무드 보류</span>}
              {f.axes.slice(0, 4).map(([name, n]) => (
                <Link key={name} href={url({ axis: name })} className={`rounded-lg border px-2 py-0.5 text-caption ${AXIS_TONE[name] ?? "border-line"}`}>{name} {n}</Link>
              ))}
              <span className="ml-auto text-caption text-muted tabular-nums">묶음 {f.members.length} · 검색어 {f.terms}</span>
            </div>

            <FamilyNote found={noteFor(f, notes)} />
            {(() => {
              // 사진 태그에 쓰는 영어 문장 — 사진 태그용으로 굳힌 v1 가족과 식구로 짝짓는다(docs/47 §3-2)
              const v1 = v1KeyFor(f.members, tagLayers);
              if (!v1) return null;
              const { prompts, edited } = familyPromptsFor(v1, promptDrafts, promptEdits);
              const ko = familyKoFor(v1, prompts, koDrafts, koEdits);
              return (
                <form action={saveFamilyPrompts} className="mt-3">
                  <input type="hidden" name="key" value={v1} />
                  <p className="text-caption text-muted">
                    <b className="text-fg">영어 문장</b> — 사진 태그(SigLIP)가 이 문장으로 사진을 고릅니다 · {edited ? "사람이 고침" : "qwen 초안"} · 한 줄에 한 문장, 사진에 보이는 것(빛 · 색 · 장소 · 포즈 · 표정)으로
                  </p>
                  <textarea key={`${v1}-${prompts.join("|")}`} name="prompts" defaultValue={prompts.join("\n")} rows={Math.max(4, prompts.length + 1)}
                    aria-label={`${familyTitle(f)} 영어 문장`}
                    className="mt-1 w-full rounded-xl border-2 border-danger bg-bg px-3 py-2 font-mono text-caption leading-relaxed" />
                  <p className="mt-2 text-caption text-muted">
                    <b className="text-fg">한글 문장</b> — 위 영어와 줄마다 짝입니다. 여기서 고치고 [한글 → 영어로 저장] 을 누르면 <b className="text-fg">바뀐 줄만</b> 영어로 바꿉니다
                    {ko.stale && <span className="text-warning-ink"> · 영어를 따로 고쳐서 한글이 예전 영어 기준입니다</span>}
                  </p>
                  <textarea key={`${v1}-ko-${ko.lines.join("|")}`} name="prompts_ko" defaultValue={ko.lines.join("\n")} rows={Math.max(4, ko.lines.length + 1)}
                    aria-label={`${familyTitle(f)} 한글 문장`} placeholder="한 줄에 한 문장 — 예: 노을 지는 바닷가에서 실루엣만 보이는 커플 사진"
                    className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-body-sm leading-relaxed" />
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <button className="rounded-xl border border-line px-3 py-1.5 text-body-sm hover:border-fg/40">영어 문장 저장</button>
                    <button formAction={translateFamilyPrompts} className="rounded-xl border-2 border-brand px-3 py-1.5 text-body-sm font-medium text-brand"
                      title="한글 칸에서 바뀐 줄만 영어 문장으로 바꿔 저장합니다(로컬 qwen, 몇 초 걸립니다)">한글 → 영어로 저장</button>
                    <span className="text-caption text-muted">저장 뒤 <code>py tag_photo_moods.py</code> 를 다시 돌려야 사진 태그에 반영됩니다</span>
                  </div>
                </form>
              );
            })()}

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
                      {(() => { const home = byId.get(g.home); return home ? familyTitle(home) : familyLabel({ id: g.home }); })()}
                    </Link>
                    <span className="ml-1 tabular-nums text-muted/60">{Math.round(g.share * 100)}%</span>
                  </span>
                ))}
                {f.guests.length > 8 && <span className="text-muted/60">외 {f.guests.length - 8}</span>}
              </p>
            )}

            <form action={nameFamily} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={f.id} />
              <input key={`${f.id}-${familyName(f)?.name ?? ""}`} name="name" defaultValue={familyName(f)?.name ?? ""} maxLength={30}
                aria-label={`${familyLabel(f)} 가족 이름`} placeholder="이름 짓기"
                className="w-56 rounded-xl border-2 border-danger bg-bg px-3 py-1.5 text-body-sm" />
              <button className="rounded-xl border border-line px-3 py-1.5 text-body-sm hover:border-fg/40">저장</button>
              <span className="text-caption text-muted">비우고 저장하면 이름을 지웁니다</span>
            </form>
          </li>
          </Fragment>
        ))}
      </ul>
      </>
      )}
    </section>
  );
}

/** 가족 식구를 무리로 — 무리는 ≈ 로 이어 한 칸, 혼자인 묶음은 흐린 칸 */
function MemberClusters({ members, clusters }: { members: readonly string[]; clusters: readonly { members: readonly string[] }[] }) {
  return (
    <>
      {clustersIn(members, clusters).map((g) => (
        <span key={g.join("|")} className={`rounded-lg border px-2 py-0.5 text-caption ${g.length > 1 ? "border-brand/50 text-fg" : "border-line text-muted"}`}>
          {g.join(" ≈ ")}
        </span>
      ))}
    </>
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

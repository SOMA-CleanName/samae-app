import Link from "next/link";
import { AXES, AXIS_BAR, AXIS_TONE } from "@/lib/mood-axes";
import { loadMoodAdminData } from "@/lib/mood-admin-data";
import { FROM_LABEL, type PhotoTerm } from "@/lib/mood-photo-terms";
import { loadPhotoGroups } from "@/lib/mood-photo-terms-data";
import { NO_AXIS } from "@/lib/mood-screen";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/mood/terms/photo";
const ALL = "전체";
const SIZE = 25;
type Params = { q?: string; axis?: string; multi?: string; page?: string; view?: string };

/** 묶음 카드 하나 — 이름은 식구 중 작가 사진이 많은 말(표시용, 대표가 아니다). 축은 식구 축의 합. */
type Card = { head: string; axes: string[]; usage: string; members: PhotoTerm[]; photos: number };

/**
 * 검색어(D1) · 묶음(D2) — 사진 무드 표현 (docs/40 §16-1 · §17-5, 2026-09-23 · 29).
 * 한 화면에 층이 둘이라 뎁스를 갈랐다(사람 요청 2026-09-29): `?view=terms` 는 **검색어 하나씩**(D1), 기본은 **묶음 카드**(D2).
 * 사전 7만 낱말이 아니라 사진에 실제로 쓸 말의 뼈대(사진 표현 목록 · 검증 후보 · 작가 태그, 목적 · 관계 · 장소 말은 뺌)다.
 * 묶음은 build_photo_groups.py 가 만든 photo-groups.json — 검색어 하나는 한 묶음에만 든다.
 */
export default async function MoodPhotoTermsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 60);
  const axis = params.axis === ALL || params.axis === NO_AXIS || AXES.includes((params.axis ?? "") as (typeof AXES)[number]) ? params.axis! : AXES[0];
  const multi = params.multi === "1";
  const flat = params.view === "terms";                                  // D1 검색어 하나씩 / 기본은 D2 묶음 카드
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page) || 1)));

  const [{ photoTerms }, grouping] = await Promise.all([loadMoodAdminData(), loadPhotoGroups()]);
  const kept = photoTerms.filter((r) => !r.drop);
  const byLabel = new Map(kept.map((r) => [r.label, r]));

  // 묶음 카드 — 묶음에 든 말은 묶음으로, 묶음 파일에 없는 말(그 뒤 살린 것)은 혼자 한 묶음
  const cards: Card[] = [];
  const placed = new Set<string>();
  for (const g of grouping?.groups ?? []) {
    const members = g.members.map((m) => byLabel.get(m)).filter((r): r is PhotoTerm => !!r && !placed.has(r.label));
    if (!members.length) continue;
    for (const m of members) placed.add(m.label);
    cards.push(card(members));
  }
  for (const r of kept) if (!placed.has(r.label)) cards.push(card([r]));

  const tally = new Map<string, { groups: number; terms: number }>(AXES.map((a) => [a, { groups: 0, terms: 0 }]));
  let noAxis = { groups: 0, terms: 0 };
  for (const c of cards) {
    if (!c.axes.length) noAxis = { groups: noAxis.groups + 1, terms: noAxis.terms + c.members.length };
    for (const a of c.axes) {
      const t = tally.get(a);
      if (t) { t.groups += 1; t.terms += c.members.length; }
    }
  }
  const widest = Math.max(1, ...[...tally.values()].map((t) => t.terms));
  const multiCount = cards.filter((c) => c.axes.length > 1).length;

  const needle = q;
  const groupOf = new Map<string, Card>();                               // 검색어 → 제가 든 묶음(D1 화면에서 보여 준다)
  for (const c of cards) for (const m of c.members) groupOf.set(m.label, c);
  const termRows = !flat ? [] : kept.filter((r) =>
    (axis === ALL || (axis === NO_AXIS ? !r.axes.length : r.axes.includes(axis)))
    && (!multi || r.axes.length > 1)
    && (!needle || r.label.includes(needle) || r.usage.includes(needle) || (r.alt ?? []).some((a) => a.includes(needle))))
    .sort((a, b) => b.photos - a.photos || a.label.localeCompare(b.label, "ko"));
  const rows = cards.filter((c) =>
    (axis === ALL || (axis === NO_AXIS ? !c.axes.length : c.axes.includes(axis)))
    && (!multi || c.axes.length > 1)
    && (!needle || c.members.some((m) => m.label.includes(needle) || m.usage.includes(needle) || (m.alt ?? []).some((a) => a.includes(needle)))))
    .sort((a, b) => b.members.length - a.members.length || b.photos - a.photos || a.head.localeCompare(b.head, "ko"));
  const total = flat ? termRows.length : rows.length;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const at = Math.min(page, pages);
  const shown = rows.slice((at - 1) * SIZE, at * SIZE);
  const shownTerms = termRows.slice((at - 1) * SIZE, at * SIZE);
  const url = (changes: Params) => `${BASE}?${new URLSearchParams(Object.entries({ q, axis, multi: multi ? "1" : "", view: flat ? "terms" : "", page: "1", ...changes }).filter(([, v]) => v))}`;

  return (
    <section aria-labelledby="photo-terms-heading">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="photo-terms-heading" className="text-h2 font-semibold">{flat ? "검색어 — 사진 무드 표현" : "묶음 — 사진 무드 표현"}</h2>
      </div>
      <p className="mt-1 text-body-sm text-muted">
        {flat
          ? <><b className="text-fg">검색어(D1)</b> {kept.length.toLocaleString("ko-KR")}개를 하나씩 봅니다 — 낱말 고르기에서 살아남은 것에 축과 용례를 붙인 것. 어느 묶음에 들었는지도 함께 보여 줍니다.</>
          : <>검색어 {kept.length.toLocaleString("ko-KR")}개를 서로 바꿔 써도 사진이 같은 것끼리 묶은 <b className="text-fg">묶음(D2) {cards.length.toLocaleString("ko-KR")}개</b>
            (둘 이상 {cards.filter((c) => c.members.length > 1).length.toLocaleString("ko-KR")})입니다. 검색어 하나는 한 묶음에만 듭니다.</>}
        {grouping && <> 묶음은 {grouping.made_at} 판정(서로 고른 짝만, 덩이 사이 짝 비율 절반 이상일 때만 합침)입니다.</>}
      </p>
      <p className="mt-1 text-caption text-muted">
        축은 서로 대등해서 한 묶음이 여러 축에 나옵니다. 묶음 이름은 식구 중 작가 사진이 많은 말이고 대표가 아닙니다. 원래 표기(야구장스냅 · 가을 감성)는 검색어 옆에 작게. DB 에는 반영하지 않았습니다.
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
                  <span className="text-caption text-muted tabular-nums">묶음 {count.groups.toLocaleString("ko-KR")} · 검색어 <b className="text-fg">{count.terms.toLocaleString("ko-KR")}</b></span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-fg/10" aria-hidden>
                  <div className={`h-full rounded-full ${AXIS_BAR[name]}`} style={{ width: `${Math.max(2, (count.terms / widest) * 100)}%` }} />
                </div>
              </Link>
            </li>
          );
        })}
        <li>
          <Link href={url({ axis: ALL })} aria-current={axis === ALL ? "true" : undefined}
            className={`flex h-full items-center justify-between gap-2 rounded-xl border p-3 transition-colors ${axis === ALL ? "border-brand bg-brand/10 text-brand" : "border-line hover:border-fg/40"}`}>
            <strong className="text-body font-semibold">전체</strong>
            <span className="text-caption text-muted tabular-nums">묶음 {cards.length.toLocaleString("ko-KR")} · 검색어 <b className="text-fg">{kept.length.toLocaleString("ko-KR")}</b></span>
          </Link>
        </li>
        {noAxis.groups > 0 && (
          <li className="sm:col-span-2 lg:col-span-3">
            <Link href={url({ axis: NO_AXIS })} aria-current={axis === NO_AXIS ? "true" : undefined}
              className={`flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-dashed p-3 transition-colors ${axis === NO_AXIS ? "border-brand bg-brand/10 text-brand" : "border-line hover:border-fg/40"}`}>
              <strong className="text-body font-semibold">축 없음</strong>
              <span className="text-caption text-muted tabular-nums">묶음 {noAxis.groups} · 검색어 <b className="text-fg">{noAxis.terms}</b> — 축은 mood-edits/photo-term-axes.jsonl 에 한 줄 적으면 붙는다</span>
            </Link>
          </li>
        )}
      </ul>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action={BASE} className="flex min-w-0 flex-1 flex-wrap gap-2">
          <input type="hidden" name="axis" value={axis} />
          {multi && <input type="hidden" name="multi" value="1" />}
          {flat && <input type="hidden" name="view" value="terms" />}
          <input key={`q-${q}`} name="q" defaultValue={q} maxLength={60} aria-label="검색어 찾기" placeholder="검색어 · 원래 표기 · 용례 아무거나"
            className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
          <button className="rounded-xl bg-fg px-5 py-2 text-bg">검색</button>
        </form>
        <Link href={url({ multi: multi ? "" : "1" })} aria-pressed={multi}
          className={`rounded-xl border px-4 py-2 text-body-sm ${multi ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
          축 2개 이상만 <strong className="ml-1 tabular-nums">{multiCount.toLocaleString("ko-KR")}</strong>
        </Link>
        {(q || multi || axis !== AXES[0]) && <Link href={flat ? `${BASE}?view=terms` : BASE} className="rounded-xl border border-line px-4 py-2 text-body-sm">초기화</Link>}
      </div>

      <p className="mb-4 text-body-sm text-muted">
        <b className="text-fg">{axis === ALL || axis === NO_AXIS ? axis : `${axis} 축`}</b>{" "}
        <b className="text-fg tabular-nums">{total.toLocaleString("ko-KR")}</b>{flat ? "개 검색어" : "개 묶음"} 중{" "}
        <b className="text-fg tabular-nums">{total ? ((at - 1) * SIZE + 1).toLocaleString("ko-KR") : 0}–{Math.min(at * SIZE, total).toLocaleString("ko-KR")}</b>번째 · {flat ? "작가 사진 많은 순" : "식구 많은 순"}
      </p>

      {total === 0 && <p className="rounded-xl border border-line p-8 text-center text-muted">해당하는 {flat ? "검색어" : "묶음"}가 없습니다.</p>}

      {/* D1 — 검색어 하나씩. 묶음 칸은 그 검색어가 든 묶음으로 간다 */}
      {flat && (
        <ul className="space-y-2">
          {shownTerms.map((r) => {
            const g = groupOf.get(r.label);
            return (
              <li key={r.label} className="flex flex-wrap items-baseline gap-2 rounded-xl border border-line px-4 py-3">
                <b className="text-body font-medium">{r.label}</b>
                {r.alt?.length ? <span className="text-caption text-muted">{r.alt.join(" · ")}</span> : null}
                {r.kept && <span className="rounded border border-brand/40 px-1 text-caption text-brand">살림</span>}
                {r.axes.map((name) => (
                  <Link key={name} href={url({ axis: name })} className={`rounded-lg border px-2 py-0.5 text-caption ${AXIS_TONE[name] ?? "border-line"}`}>{name}</Link>
                ))}
                {!r.axes.length && <span className="rounded-lg border border-line px-2 py-0.5 text-caption text-muted">축 없음</span>}
                {r.usage && <span className="text-body-sm text-muted">{r.usage}</span>}
                <span className="ml-auto flex items-baseline gap-3 text-caption text-muted">
                  <span>{r.from.map((k) => FROM_LABEL[k]).join(" · ")}</span>
                  {r.photos > 0 && <span className="tabular-nums">{r.photos.toLocaleString("ko-KR")}장</span>}
                  {g && g.members.length > 1 && (
                    <Link href={url({ view: "", q: g.head })} className="underline-offset-2 hover:underline">묶음 {g.head} · {g.members.length}</Link>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!flat && (
      <ul className="space-y-3">
        {shown.map((c) => (
          <li key={c.head} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className="text-body font-semibold">{c.head}</strong>
              {c.axes.map((name) => (
                <Link key={name} href={url({ axis: name })} className={`rounded-lg border px-2 py-0.5 text-caption ${AXIS_TONE[name] ?? "border-line"}`}>{name}</Link>
              ))}
              {!c.axes.length && <span className="rounded-lg border border-line px-2 py-0.5 text-caption text-muted">축 없음</span>}
              <span className="ml-auto text-caption text-muted tabular-nums">
                {c.members.length > 1 && <>검색어 {c.members.length} · </>}
                {c.photos > 0 ? `작가 사진 ${c.photos.toLocaleString("ko-KR")}장` : "작가 사진 없음"}
              </span>
            </div>
            {c.usage && <p className="mt-1 text-body-sm text-muted">{c.usage}</p>}
            <ul className="mt-3 flex flex-wrap items-center gap-2">
              {c.members.map((m) => (
                <li key={m.label} className="flex items-baseline gap-1.5 rounded-xl border border-line px-3 py-1.5" title={[m.usage, ...m.from.map((k) => FROM_LABEL[k])].filter(Boolean).join(" · ")}>
                  <b className="text-body-sm font-medium">{m.label}</b>
                  {m.alt?.length ? <span className="text-caption text-muted">{m.alt.join(" · ")}</span> : null}
                  {m.kept && <span className="rounded border border-brand/40 px-1 text-caption text-brand">살림</span>}
                  {m.from.includes("author") && <span className="text-caption text-muted">{m.photos.toLocaleString("ko-KR")}장</span>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      )}

      {pages > 1 && (
        <nav aria-label="묶음 페이지" className="mt-5 flex flex-wrap items-center justify-between gap-3 text-body-sm">
          {at > 1 ? <Link href={url({ page: String(at - 1) })} className="rounded-xl border border-line px-4 py-2">이전</Link> : <span className="rounded-xl border border-line px-4 py-2 text-muted">이전</span>}
          <form action={BASE} className="flex items-center gap-2">
            {q && <input type="hidden" name="q" value={q} />}
            <input type="hidden" name="axis" value={axis} />
            {multi && <input type="hidden" name="multi" value="1" />}
            {flat && <input type="hidden" name="view" value="terms" />}
            <input key={`page-${at}`} name="page" defaultValue={String(at)} inputMode="numeric" aria-label="페이지 번호" className="w-20 rounded-xl border border-line bg-bg px-3 py-2 text-center tabular-nums" />
            <span className="text-muted tabular-nums">/ {pages.toLocaleString("ko-KR")}</span>
            <button className="rounded-xl border border-line px-3 py-2">이동</button>
          </form>
          {at < pages ? <Link href={url({ page: String(at + 1) })} className="rounded-xl border border-line px-4 py-2">다음</Link> : <span className="rounded-xl border border-line px-4 py-2 text-muted">다음</span>}
        </nav>
      )}
    </section>
  );
}

function card(members: PhotoTerm[]): Card {
  const head = [...members].sort((a, b) => b.photos - a.photos || a.label.localeCompare(b.label, "ko"))[0].label;
  const axes = AXES.filter((a) => members.some((m) => m.axes.includes(a)));
  const usage = members.find((m) => m.label === head)?.usage || members.find((m) => m.usage)?.usage || "";
  return { head, axes, usage, members, photos: members.reduce((n, m) => n + m.photos, 0) };
}

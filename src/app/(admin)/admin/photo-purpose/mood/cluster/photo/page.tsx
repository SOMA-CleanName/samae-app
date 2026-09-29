import Link from "next/link";
import { AXIS_TONE } from "@/lib/mood-axes";
import { counts, effective, FILTERS, latestReviews, selectCases, type ClusterCase, type ClusterReview, type Filter } from "@/lib/mood-cluster";
import { loadPhotoClusterCases, loadPhotoClusterReviews, loadPhotoClusters } from "@/lib/mood-photo-layers-data";
import { judgePhotoCluster } from "./actions";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/mood/cluster/photo";
const SIZE = 20;
type Params = { filter?: string; kind?: string; q?: string; page?: string };
const LABEL: Record<Filter, string> = { unsure: "아직 안 정함", "ai-group": "AI가 묶음", "ai-keep": "AI가 안 묶음", mine: "내가 정한 것", all: "전체" };
const KINDS = [
  { key: "", label: "전체" },
  { key: "root", label: "같은 뿌리·소리 변형" },
  { key: "similar", label: "유사도 아주 높음 · 서로 고름" },
];

/**
 * 무리(D3) 묶기 — 사진 무드 표현 뼈대 (docs/40 §16-4 · §17-5).
 * 사전 묶음 쪽 화면(../page.tsx)과 같은 규칙이고, 대상이 뼈대 묶음(photo-groups.json)이다. 무리는 사람이 확정한다. 무리에는 대표가 없다.
 */
export default async function MoodPhotoClusterPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(params.filter ?? "") ? (params.filter as Filter) : "unsure";
  const kind = KINDS.some((k) => k.key === params.kind) ? params.kind! : "";
  const q = (params.q ?? "").trim().slice(0, 40);
  const page = Math.max(1, Math.min(10000, Math.floor(Number(params.page) || 1)));

  const [cases, reviewLog, clusters] = await Promise.all([loadPhotoClusterCases(), loadPhotoClusterReviews(), loadPhotoClusters()]);
  const reviews = latestReviews(reviewLog);
  const tally = counts(cases, reviews);
  const rows = selectCases(cases, reviews, filter, kind, q);
  const pages = Math.max(1, Math.ceil(rows.length / SIZE));
  const at = Math.min(page, pages);
  const shown = rows.slice((at - 1) * SIZE, at * SIZE);
  const url = (changes: Params) => `${BASE}?${new URLSearchParams(Object.entries({ filter, kind, q, page: "1", ...changes }).filter(([, v]) => v))}`;
  const visibleFilters = FILTERS.filter((k) => !k.startsWith("ai-") || tally[k] > 0);   // AI 1차 판정(judge_photo_clusters.py)이 붙은 뒤부터 보인다

  return (
    <section aria-labelledby="photo-cluster-heading">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="photo-cluster-heading" className="text-h2 font-semibold">무리 묶기 — 사진 무드 표현</h2>
      </div>
      <p className="mt-1 text-body-sm text-muted">
        카드 하나는 <b className="text-fg">무리가 아니라 후보</b>입니다 — 칸 하나하나가 뼈대의 묶음이고, &ldquo;이 중에 거의 같은 게 있나&rdquo; 를 보라고 모아 온 것입니다.
        <span className="rounded bg-amber-500/20 px-1 text-fg">밑줄 친 검색어</span>가 글자 때문에 걸린 것입니다. 거의 같은 것(깜박이는 · 껌벅이는)만 무리로 묶고,
        결이 비슷한 것(깜박이는 · 번쩍이는)은 이웃 그래프에 맡깁니다. 묶음은 없애지 않으니 틀려도 무리에서 빼면 됩니다. 무리에는 대표가 없습니다.
        후보 {cases.length.toLocaleString("ko-KR")}곳 — 같은 뿌리 {cases.filter((c) => c.kind === "root").length.toLocaleString("ko-KR")} ·
        유사도 · 서로 고름 {cases.filter((c) => c.kind === "similar").length.toLocaleString("ko-KR")}.
        {clusters && <> 지금 무리 <b className="text-fg">{clusters.clusters.length.toLocaleString("ko-KR")}개</b>(판정 {clusters.reviewed}) — 바꾼 뒤엔 build_photo_clusters.py 로 다시 굳힙니다.</>}
      </p>

      <nav aria-label="거르기" className="mt-5 flex flex-wrap gap-2">
        {visibleFilters.map((key) => (
          <Link key={key} href={url({ filter: key })} aria-current={filter === key ? "page" : undefined}
            className={`rounded-xl border px-4 py-2.5 text-body-sm ${filter === key ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
            {LABEL[key]}<strong className="ml-2 tabular-nums">{tally[key].toLocaleString("ko-KR")}</strong>
          </Link>
        ))}
      </nav>
      <nav aria-label="후보 갈래" className="mt-2 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Link key={k.key || "all"} href={url({ kind: k.key })} aria-current={kind === k.key ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-caption ${kind === k.key ? "border-fg text-fg" : "border-line text-muted hover:text-fg"}`}>
            {k.label}
          </Link>
        ))}
      </nav>

      <form action={BASE} className="my-4 flex flex-wrap gap-2">
        <input type="hidden" name="filter" value={filter} />
        {kind && <input type="hidden" name="kind" value={kind} />}
        <input key={`q-${q}`} name="q" defaultValue={q} maxLength={40} aria-label="후보 찾기" placeholder="검색어 · 뿌리" className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
        <button className="rounded-xl bg-fg px-5 py-2 text-bg">검색</button>
      </form>

      {!cases.length && <p className="rounded-xl border border-line p-8 text-center text-muted">후보가 없습니다 — build_photo_cluster_candidates.py 를 먼저 돌리세요.</p>}
      {cases.length > 0 && !shown.length && <p className="rounded-xl border border-line p-8 text-center text-muted">해당하는 후보가 없습니다.</p>}

      <ul className="space-y-3">{shown.map((c) => <CaseCard key={c.id} c={c} review={reviews.get(c.id)} />)}</ul>

      {pages > 1 && (
        <nav aria-label="무리 후보 페이지" className="mt-5 flex items-center justify-between text-body-sm">
          {at > 1 ? <Link href={url({ page: String(at - 1) })} className="rounded-xl border border-line px-4 py-2">이전</Link> : <span className="rounded-xl border border-line px-4 py-2 text-muted">이전</span>}
          <span className="tabular-nums">{at} / {pages}</span>
          {at < pages ? <Link href={url({ page: String(at + 1) })} className="rounded-xl border border-line px-4 py-2">다음</Link> : <span className="rounded-xl border border-line px-4 py-2 text-muted">다음</span>}
        </nav>
      )}
    </section>
  );
}

function CaseCard({ c, review }: { c: ClusterCase; review?: ClusterReview }) {
  const state = effective(c, review);
  const picked = new Set(state.verdict === "group" ? state.members : []);
  const badge = state.verdict === undefined ? "아직 안 정함" : `${state.by === "me" ? "내가" : "AI가"} ${state.verdict === "group" ? "묶음" : "안 묶음"}`;
  return (
    <li className={`rounded-xl border p-4 ${state.verdict === "group" ? "border-brand/50" : "border-line"}`}>
      <form action={judgePhotoCluster}>
        <input type="hidden" name="id" value={c.id} />
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-caption text-muted tabular-nums">{c.id}</span>
          <span className="text-caption text-muted">{c.reason}</span>
          <span className={`rounded-lg border px-2 py-0.5 text-caption ${state.verdict === "group" ? "border-brand text-brand" : state.verdict ? "border-line text-muted" : "border-amber-400 text-amber-700"}`}>{badge}</span>
          <span className="ml-auto flex gap-2">
            <button name="verdict" value="group" className="rounded-lg border border-line px-3 py-1 text-caption hover:border-brand hover:text-brand">무리로 묶기</button>
            <button name="verdict" value="keep" className="rounded-lg border border-line px-3 py-1 text-caption text-muted hover:text-fg">묶지 않음</button>
          </span>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {c.groups.map((g) => (
            <li key={g.head} className="rounded-lg border border-line p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" name="g" value={g.head} defaultChecked={picked.has(g.head)} />
                  <strong className="text-body-sm font-semibold">{g.label}</strong>
                </label>
                {g.axes.map((axis) => <span key={axis} className={`rounded border px-1.5 text-caption ${AXIS_TONE[axis] ?? "border-line"}`}>{axis}</span>)}
              </div>
              {g.usage && <p className="mt-0.5 text-caption text-muted">{g.usage}</p>}
              <ul className="mt-1.5 space-y-0.5">
                {g.terms.map((t) => (
                  <li key={t.term} className="text-body-sm">
                    <b className={`font-medium ${t.hit ? "rounded bg-amber-500/20 px-1 underline decoration-amber-500 underline-offset-2" : ""}`}>{t.term}</b>
                    {t.gloss && t.term !== g.label && <span className="text-caption text-muted"> — {t.gloss}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </form>
      {state.verdict === "group" && <p className="mt-2 text-body-sm">무리: {state.members.map((h) => <b key={h} className="mr-2">{h}</b>)}</p>}
    </li>
  );
}

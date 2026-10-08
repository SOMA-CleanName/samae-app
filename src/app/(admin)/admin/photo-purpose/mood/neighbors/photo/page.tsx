import Link from "next/link";
import { AXES, AXIS_BAR, AXIS_TONE } from "@/lib/mood-axes";
import { components, edgeKey, expand, resolveNeighbors, searchHeads, shakyEdges, type Neighbor } from "@/lib/mood-neighbors";
import { loadPhotoClusters, loadPhotoNeighborBundle, loadPhotoNeighborEdits, type PhotoNeighborBundle } from "@/lib/mood-photo-layers-data";
import { AddEdge, EdgeControls } from "../EdgeControls";
import { editPhotoEdge } from "./actions";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/mood/neighbors/photo";
const QUEUE_SIZE = 25;
const HEADS_SIZE = 300;
type Params = { head?: string; q?: string; view?: string; page?: string };

/**
 * 이웃 그래프 — 사진 무드 표현 뼈대 (docs/40 §14 · §17-5).
 * 사전 묶음 쪽 화면(../page.tsx)과 같은 모양이고, 대상이 뼈대 묶음(photo-groups.json)이다. 판정은 qwen3:14b(judge_photo_neighbors.py),
 * 간선은 무향, 한쪽만 이어도 잇는다(§14-7). 무리(D3)에 든 묶음은 칩에 표시한다.
 */
export default async function MoodPhotoNeighborsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const view = ["graph", "queue", "health"].includes(params.view ?? "") ? params.view! : "graph";
  const q = (params.q ?? "").trim().slice(0, 40);
  const page = Math.max(1, Math.min(10000, Math.floor(Number(params.page) || 1)));
  const [bundle, edits, clusters] = await Promise.all([loadPhotoNeighborBundle(), loadPhotoNeighborEdits(), loadPhotoClusters()]);

  if (!bundle) {
    return (
      <section aria-labelledby="photo-neighbors-heading">
        <h2 id="photo-neighbors-heading" className="text-h2 font-semibold">이웃 그래프 — 사진 무드 표현</h2>
        <p className="mt-4 rounded-xl border border-line p-8 text-center text-muted">아직 판정하지 않았습니다 — judge_photo_neighbors.py 를 돌리면 여기에 그래프가 뜹니다.</p>
      </section>
    );
  }

  const byHead = resolveNeighbors(bundle, edits);
  const known = new Set(bundle.heads);
  const head = params.head && known.has(params.head) ? params.head : "";
  const listed = q ? searchHeads(bundle.heads, bundle.nodes, q, bundle.heads.length) : bundle.heads;
  const pages = Math.max(1, Math.ceil(listed.length / HEADS_SIZE));
  const at = Math.min(page, pages);
  const shown = listed.slice((at - 1) * HEADS_SIZE, at * HEADS_SIZE);
  const queue = shakyEdges(bundle, edits);
  const queuePages = Math.max(1, Math.ceil(queue.length / QUEUE_SIZE));
  const queueAt = Math.min(page, queuePages);
  const url = (changes: Params) => `${BASE}?${new URLSearchParams(Object.entries({ view, q, head, page: "1", ...changes }).filter(([, v]) => v))}`;
  const gloss = (name: string) => bundle.nodes[name]?.usage ?? "";
  const axesOf = (name: string) => bundle.nodes[name]?.axes ?? [];
  const membersOf = (name: string) => bundle.nodes[name]?.members ?? [name];
  const clusterOf = new Map<string, string[]>();
  for (const c of clusters?.clusters ?? []) for (const m of c.members) clusterOf.set(m, c.members.filter((x) => x !== m));

  const tabs = [
    { key: "graph", label: "그래프 · 수정" },
    { key: "queue", label: "엇갈린 간선", count: queue.length },
    { key: "health", label: "그래프 상태" },
  ];

  return (
    <section aria-labelledby="photo-neighbors-heading">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="photo-neighbors-heading" className="text-h2 font-semibold">이웃 그래프 — 사진 무드 표현</h2>
      </div>
      <p className="mt-1 text-body-sm text-muted">
        뼈대 묶음 {bundle.heads.length.toLocaleString("ko-KR")}개를 잇는 그래프입니다 — 검색 결과가 적을 때 대신 보여줄 무드. <b className="text-fg">간선은 무향이라 한쪽만 이어도 양쪽에 섭니다.</b>{" "}
        묶음의 이름은 식구 중 작가 사진이 많은 말이고 대표가 아닙니다. 고친 내용은 자동 생성분과 따로 쌓여 그래프를 다시 만들어도 살아남습니다.
        판정 {bundle.judged.toLocaleString("ko-KR")} / {bundle.heads.length.toLocaleString("ko-KR")}
        {bundle.judged < bundle.heads.length && <b className="text-fg"> · 아직 판정 중이라 간선이 늘어납니다</b>}
        {clusters && <> · 무리 {clusters.clusters.length.toLocaleString("ko-KR")}개(칩의 ≈)</>}
      </p>

      <nav aria-label="보기" className="my-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link key={tab.key} href={url({ view: tab.key })} aria-current={view === tab.key ? "page" : undefined}
            className={`rounded-xl border px-4 py-3 text-body-sm ${view === tab.key ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
            {tab.label}{tab.count !== undefined && <strong className="ml-2 tabular-nums">{tab.count.toLocaleString("ko-KR")}</strong>}
          </Link>
        ))}
      </nav>

      {view === "graph" && (
        <>
          <form action={BASE} className="mb-4 flex flex-wrap gap-2">
            <input type="hidden" name="view" value="graph" />
            <input key={`q-${q}`} name="q" defaultValue={q} maxLength={40} aria-label="무드 검색" placeholder="무드를 검색하세요 — 표현이나 용례" className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
            <button className="rounded-xl bg-fg px-5 py-2 text-bg">검색</button>
            {(q || head) && <Link href={`${BASE}?view=graph`} className="rounded-xl border border-line px-4 py-2 text-body-sm">초기화</Link>}
          </form>

          {head && (
            <div className="mb-6">
              <div className="mb-2 flex justify-end"><Link href={url({ head: "", page: String(at) })} className="text-body-sm text-muted underline hover:text-fg">닫기</Link></div>
              <HeadPanel {...{ head, byHead, gloss, axesOf, membersOf, cluster: clusterOf.get(head) ?? [], bundle, url }} />
            </div>
          )}

          <p className="mb-3 text-body-sm text-muted">
            {q ? <>“{q}” 에 걸린 </> : "전체 "}<b className="text-fg tabular-nums">{listed.length.toLocaleString("ko-KR")}</b>개
            {pages > 1 && <> 중 <b className="text-fg tabular-nums">{((at - 1) * HEADS_SIZE + 1).toLocaleString("ko-KR")}–{Math.min(at * HEADS_SIZE, listed.length).toLocaleString("ko-KR")}</b>번째</>}
            {" "}· 이름을 누르면 이웃과 식구가 위에 펼쳐집니다. 숫자는 이웃 수, 점은 축, ≈ 는 무리에 든 묶음입니다.
          </p>
          <p className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted" aria-label="축 색">
            {AXES.map((axis) => <span key={axis} className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${AXIS_BAR[axis]}`} aria-hidden />{axis}</span>)}
          </p>
          {!shown.length && <p className="rounded-xl border border-line p-8 text-center text-muted">찾은 무드가 없습니다.</p>}
          <ul className="flex flex-wrap gap-1.5">
            {shown.map((name) => (
              <li key={name}>
                <Link href={url({ head: name, page: String(at) })} aria-current={name === head ? "true" : undefined}
                  className={`inline-flex items-baseline gap-1 rounded-lg border px-2.5 py-1 text-body-sm transition-colors ${name === head ? "border-brand bg-brand/10 text-brand" : "border-line hover:border-fg/40"}`}>
                  {name}{clusterOf.has(name) && <span className="text-caption text-brand" title={`무리: ${clusterOf.get(name)!.join(" · ")}`}>≈</span>}
                  <AxisDots axes={axesOf(name)} />
                  <span className="text-caption text-muted tabular-nums">{(byHead.get(name) ?? []).length}</span>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && <Pager {...{ at, pages, url }} />}
        </>
      )}

      {view === "queue" && (
        <>
          <p className="mb-3 text-body-sm text-muted">한쪽은 이웃이라 보고 다른 쪽은 아니라고 한 간선입니다. <b className="text-fg">전부 이어져 있습니다</b> — 검수 목록이 아니라 참고 목록입니다. 유사도가 높은 것부터.</p>
          <ul className="space-y-3">
            {queue.slice((queueAt - 1) * QUEUE_SIZE, queueAt * QUEUE_SIZE).map((edge) => (
              <li key={edgeKey(edge.a, edge.b)} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <strong className="text-body font-semibold">{edge.a}</strong><AxisTags axes={axesOf(edge.a)} />
                  <span className="text-muted">↔</span>
                  <strong className="text-body font-semibold">{edge.b}</strong><AxisTags axes={axesOf(edge.b)} />
                  <span className="text-caption text-muted tabular-nums">유사도 {edge.score.toFixed(3)}</span>
                  {edge.sameFirst && <span className="rounded-lg border border-amber-400 bg-amber-500/10 px-2 py-0.5 text-caption text-amber-700">첫 글자 같음</span>}
                </div>
                <div className="mt-2 grid gap-1 text-body-sm text-muted sm:grid-cols-2">
                  <p><b className="text-fg">{edge.a}</b> — {membersOf(edge.a).join(" · ")}{gloss(edge.a) && ` / ${gloss(edge.a)}`}</p>
                  <p><b className="text-fg">{edge.b}</b> — {membersOf(edge.b).join(" · ")}{gloss(edge.b) && ` / ${gloss(edge.b)}`}</p>
                </div>
                <EdgeControls a={edge.a} b={edge.b} names={[edge.a, edge.b]} connected action={editPhotoEdge} />
              </li>
            ))}
          </ul>
          {!queue.length && <p className="rounded-xl border border-line p-8 text-center text-muted">엇갈린 간선이 없습니다.</p>}
          {queue.length > QUEUE_SIZE && <Pager at={queueAt} pages={queuePages} url={url} />}
        </>
      )}

      {view === "health" && <Health {...{ bundle, byHead, edits: edits.length, url }} />}
    </section>
  );
}

function Pager({ at, pages, url }: { at: number; pages: number; url: (c: Params) => string }) {
  return (
    <nav aria-label="페이지" className="mt-5 flex items-center justify-between text-body-sm">
      {at > 1 ? <Link href={url({ page: String(at - 1) })} className="rounded-xl border border-line px-4 py-2">이전</Link> : <span className="rounded-xl border border-line px-4 py-2 text-muted">이전</span>}
      <span className="tabular-nums">{at} / {pages}</span>
      {at < pages ? <Link href={url({ page: String(at + 1) })} className="rounded-xl border border-line px-4 py-2">다음</Link> : <span className="rounded-xl border border-line px-4 py-2 text-muted">다음</span>}
    </nav>
  );
}

function HeadPanel({ head, byHead, gloss, axesOf, membersOf, cluster, bundle, url }: {
  head: string; byHead: Map<string, Neighbor[]>; gloss: (n: string) => string; axesOf: (n: string) => string[]; membersOf: (n: string) => string[];
  cluster: string[]; bundle: PhotoNeighborBundle; url: (c: Params) => string;
}) {
  const neighbors = byHead.get(head) ?? [];
  const layers = expand(byHead, head, 2);
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <strong className="text-h3 font-semibold">{head}</strong><AxisTags axes={axesOf(head)} />
        <span className="text-caption text-muted">이웃 {neighbors.length}</span>
      </div>
      {membersOf(head).length > 1 && <p className="mt-1 text-body-sm">묶음 식구 {membersOf(head).join(" · ")}</p>}
      {cluster.length > 0 && <p className="mt-1 text-body-sm text-brand">같은 무리 {cluster.map((h) => <Link key={h} href={url({ head: h })} className="mr-2 underline-offset-2 hover:underline">{h}</Link>)}</p>}
      <p className="mt-1 text-body-sm text-muted">{gloss(head) || "용례 없음"}</p>
      <AddEdge head={head} options={bundle.heads.map((h) => ({ head: h, name: h }))} action={editPhotoEdge} />
      <ul className="mt-4 space-y-2">
        {neighbors.map((n) => (
          <li key={n.head} className="flex flex-wrap items-baseline gap-2 border-b border-line py-2 last:border-0">
            <Link href={url({ head: n.head })} className="font-medium underline-offset-2 hover:underline">{n.head}</Link>
            <AxisTags axes={axesOf(n.head)} />
            {n.edited === "add" ? <span className="rounded-lg border border-brand bg-brand/10 px-2 py-0.5 text-caption text-brand">직접 이음</span> : <span className="text-caption text-muted tabular-nums">{n.score.toFixed(3)}</span>}
            <span className="text-caption text-muted">{n.state === "mutual" ? "양방향" : n.state === "disagreed" ? "한쪽만 · 엇갈림" : n.state === "floor" ? "이웃 0개를 막으려 강제로 이음" : "한쪽만"}</span>
            {n.sameFirst && <span className="rounded-lg border border-amber-400 bg-amber-500/10 px-2 py-0.5 text-caption text-amber-700">첫 글자</span>}
            <span className="w-full text-caption text-muted sm:w-auto sm:flex-1">{membersOf(n.head).slice(1).join(" · ")}{gloss(n.head) && (membersOf(n.head).length > 1 ? " / " : "") + gloss(n.head)}</span>
            <EdgeControls a={head} b={n.head} names={[head, n.head]} connected action={editPhotoEdge} />
          </li>
        ))}
      </ul>
      {!neighbors.length && <p className="mt-4 rounded-xl border border-line p-6 text-center text-muted">이웃이 없습니다. 위에서 직접 이어 주세요.</p>}
      {layers.length > 0 && (
        <div className="mt-5 rounded-xl border border-line bg-fg/[0.02] p-3">
          <p className="text-caption text-muted">진단용 — 실제 추천은 1홉을 유사도 순으로 잘라 씁니다.</p>
          {layers.map((layer, i) => (
            <p key={i} className="mt-2 text-body-sm"><span className="text-caption text-muted">{i + 1}홉 ({layer.length})</span> {layer.slice(0, 20).join(" · ")}{layer.length > 20 && ` … 외 ${layer.length - 20}개`}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function Health({ bundle, byHead, edits, url }: { bundle: PhotoNeighborBundle; byHead: Map<string, Neighbor[]>; edits: number; url: (c: Params) => string }) {
  const sizes = components(bundle.heads, byHead);
  const isolated = bundle.heads.filter((h) => !(byHead.get(h) ?? []).length);
  const degrees = bundle.heads.map((h) => (byHead.get(h) ?? []).length).sort((a, b) => a - b);
  const median = degrees[Math.floor(degrees.length / 2)] ?? 0;
  const states = bundle.edges.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.state]: (acc[e.state] ?? 0) + 1 }), {});
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([["간선", bundle.edges.length], ["이웃 수 중앙값", median], ["이웃 0개", isolated.length], ["사람이 고친 것", edits]] as const).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line p-4"><p className="text-caption text-muted">{label}</p><p className="mt-1 text-h3 font-semibold tabular-nums">{value.toLocaleString("ko-KR")}</p></div>
        ))}
      </div>
      <div className="rounded-xl border border-line p-4 text-body-sm">
        <p className="font-medium">간선의 상태</p>
        <p className="mt-1 text-muted">양방향 {(states.mutual ?? 0).toLocaleString("ko-KR")} · 한쪽만(엇갈림) {(states.disagreed ?? 0).toLocaleString("ko-KR")} · 한쪽만(후보 밖) {(states.unasked ?? 0).toLocaleString("ko-KR")}{(states.floor ?? 0) > 0 && <> · 강제로 이음 {states.floor}</>}</p>
      </div>
      <div className="rounded-xl border border-line p-4 text-body-sm">
        <p className="font-medium">연결 덩어리 {sizes.length.toLocaleString("ko-KR")}개</p>
        <p className="mt-1 text-muted">큰 것부터: {sizes.slice(0, 12).join(" · ")}{sizes.length > 12 && " …"} — 가장 큰 덩어리가 전체의 {((sizes[0] ?? 0) / bundle.heads.length * 100).toFixed(1)}%</p>
      </div>
      {isolated.length > 0 && (
        <div className="rounded-xl border border-line p-4 text-body-sm">
          <p className="font-medium">이웃이 없는 묶음 {isolated.length.toLocaleString("ko-KR")}개</p>
          <p className="mt-2 flex flex-wrap gap-2">{isolated.slice(0, 40).map((h) => <Link key={h} href={url({ view: "graph", head: h, q: h })} className="rounded-lg border border-line px-2 py-0.5 text-caption hover:border-fg/40">{h}</Link>)}{isolated.length > 40 && <span className="text-caption text-muted">… 외 {isolated.length - 40}개</span>}</p>
        </div>
      )}
    </div>
  );
}

function AxisTags({ axes }: { axes: string[] }) {
  if (!axes.length) return null;
  return <span className="inline-flex flex-wrap gap-1">{axes.map((axis) => <span key={axis} className={`rounded-md border px-1.5 text-caption ${AXIS_TONE[axis] ?? "border-line"}`}>{axis}</span>)}</span>;
}

function AxisDots({ axes }: { axes: string[] }) {
  const ordered = AXES.filter((axis) => axes.includes(axis));
  if (!ordered.length) return null;
  return <span className="inline-flex items-center gap-0.5 self-center" title={ordered.join(" · ")} aria-label={`축 ${ordered.join(", ")}`}>{ordered.map((axis) => <span key={axis} className={`h-1.5 w-1.5 rounded-full ${AXIS_BAR[axis]}`} aria-hidden />)}</span>;
}

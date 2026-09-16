import Link from "next/link";
import { loadEdits, loadNeighborBundle } from "@/lib/mood-neighbors-data";
import {
  components, edgeKey, expand, resolveNeighbors, shakyEdges, searchHeads,
  type Neighbor,
} from "@/lib/mood-neighbors";
import { AXIS_TONE } from "@/lib/mood-axes";
import { EdgeControls, AddEdge } from "./EdgeControls";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/mood/neighbors";
const QUEUE_SIZE = 25;
const HEADS_SIZE = 20;
type Params = { head?: string; q?: string; view?: string; page?: string };

export default async function MoodNeighborsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const view = ["graph", "queue", "health"].includes(params.view ?? "") ? params.view! : "graph";
  const q = (params.q ?? "").trim().slice(0, 40);
  const page = Math.max(1, Math.min(10000, Math.floor(Number(params.page) || 1)));

  const [bundle, edits] = await Promise.all([loadNeighborBundle(), loadEdits()]);
  const byHead = resolveNeighbors(bundle, edits);
  const known = new Set(bundle.heads);
  const head = params.head && known.has(params.head) ? params.head : "";
  // 검색은 걸러내기일 뿐, 비워 두면 2,647개가 다 나온다 — 전수로 훑을 수 있어야 한다.
  const listed = q ? searchHeads(bundle.heads, bundle.nodes, q, bundle.heads.length) : bundle.heads;
  const pages = Math.max(1, Math.ceil(listed.length / HEADS_SIZE));
  const at = Math.min(page, pages);
  const shown = head ? [head] : listed.slice((at - 1) * HEADS_SIZE, at * HEADS_SIZE);
  const queue = shakyEdges(bundle, edits);
  const queuePages = Math.max(1, Math.ceil(queue.length / QUEUE_SIZE));
  const queueAt = Math.min(page, queuePages);
  const url = (changes: Params) =>
    `${BASE}?${new URLSearchParams(Object.entries({ view, q, head, page: "1", ...changes }).filter(([, v]) => v))}`;

  const gloss = (name: string) => bundle.nodes[name]?.senses?.[0] ?? "";
  const axesOf = (name: string) => bundle.nodes[name]?.axes ?? [];
  const settled = new Set(edits.map((e) => edgeKey(e.a, e.b)));

  const tabs = [
    { key: "graph", label: "그래프 · 수정" },
    { key: "queue", label: "엇갈린 간선", count: queue.length },
    { key: "health", label: "그래프 상태" },
  ];

  return (
    <section aria-labelledby="neighbors-heading">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="neighbors-heading" className="text-h2 font-semibold">이웃 그래프</h2>
        <Link href="/admin/photo-purpose/mood/axes" className="text-body-sm text-muted underline hover:text-fg">축 배정으로</Link>
      </div>
      <p className="mt-1 text-body-sm text-muted">
        검색 결과가 적을 때 대신 보여줄 무드를 잇는 그래프입니다. <b className="text-fg">간선은 무향이라 한쪽만 이어도 양쪽에 섭니다.</b>{" "}
        고친 내용은 자동 생성분과 따로 쌓여 <b className="text-fg">그래프를 다시 만들어도 살아남습니다.</b>{" "}
        판정 {bundle.judged.toLocaleString("ko-KR")} / {bundle.heads.length.toLocaleString("ko-KR")}
        {bundle.judged < bundle.heads.length && <b className="text-fg"> · 아직 판정 중이라 간선이 늘어납니다</b>}
      </p>

      <nav aria-label="보기" className="my-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link key={tab.key} href={url({ view: tab.key })} aria-current={view === tab.key ? "page" : undefined}
            className={`rounded-xl border px-4 py-3 text-body-sm ${view === tab.key ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
            {tab.label}
            {tab.count !== undefined && <strong className="ml-2 tabular-nums">{tab.count.toLocaleString("ko-KR")}</strong>}
          </Link>
        ))}
      </nav>

      {view === "graph" && (
        <>
          <form action={BASE} className="mb-4 flex flex-wrap gap-2">
            <input type="hidden" name="view" value="graph" />
            <input key={`q-${q}`} name="q" defaultValue={q} maxLength={40} aria-label="무드 검색"
              placeholder="무드를 검색하세요 — 낱말이나 뜻풀이" className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
            <button className="rounded-xl bg-fg px-5 py-2 text-bg">검색</button>
            {(q || head) && <Link href={`${BASE}?view=graph`} className="rounded-xl border border-line px-4 py-2 text-body-sm">초기화</Link>}
          </form>

          <p className="mb-4 text-body-sm text-muted">
            {head
              ? <>한 무드만 펼쳐 봅니다. <Link href={url({ head: "", q })} className="underline hover:text-fg">전체로 돌아가기</Link></>
              : <>{q ? <>“{q}” 에 걸린 </> : "전체 "}<b className="text-fg tabular-nums">{listed.length.toLocaleString("ko-KR")}</b>개 중{" "}
                <b className="text-fg tabular-nums">{((at - 1) * HEADS_SIZE + 1).toLocaleString("ko-KR")}–{Math.min(at * HEADS_SIZE, listed.length).toLocaleString("ko-KR")}</b>번째</>}
          </p>

          {!shown.length && <p className="rounded-xl border border-line p-8 text-center text-muted">찾은 무드가 없습니다.</p>}

          <div className="space-y-4">
            {shown.map((name) => (
              <HeadPanel key={name} {...{ head: name, byHead, gloss, axesOf, bundle, url, detail: Boolean(head) }} />
            ))}
          </div>

          {!head && pages > 1 && <Pager {...{ at, pages, url, view, q }} label="무드 페이지" />}
        </>
      )}

      {view === "queue" && (
        <>
          <p className="mb-3 text-body-sm text-muted">
            한쪽은 이웃이라 보고 다른 쪽은 아니라고 한 간선입니다. <b className="text-fg">전부 이어져 있습니다</b> — 검수할 목록이 아니라 참고 목록입니다.
            나중에 추천에 이상한 게 뜨면 여기서 먼저 찾아보세요. 흔들리던 간선일 확률이 높습니다. 유사도가 높은 것부터 보입니다.
          </p>
          <ul className="space-y-3">
            {queue.slice((queueAt - 1) * QUEUE_SIZE, queueAt * QUEUE_SIZE).map((edge) => (
              <li key={edgeKey(edge.a, edge.b)} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <strong className="text-body font-semibold">{edge.a}</strong>
                  <span className="text-muted">↔</span>
                  <strong className="text-body font-semibold">{edge.b}</strong>
                  <span className="text-caption text-muted tabular-nums">유사도 {edge.score.toFixed(3)}</span>
                  {edge.photos > 0 && <span className="rounded-lg border border-line px-2 py-0.5 text-caption">같은 사진 {edge.photos}</span>}
                  {edge.sameFirst && <span className="rounded-lg border border-amber-400 bg-amber-500/10 px-2 py-0.5 text-caption text-amber-700">첫 글자 같음</span>}
                </div>
                <div className="mt-2 grid gap-1 text-body-sm text-muted sm:grid-cols-2">
                  <p><b className="text-fg">{edge.a}</b> — {gloss(edge.a) || "뜻풀이 없음"}</p>
                  <p><b className="text-fg">{edge.b}</b> — {gloss(edge.b) || "뜻풀이 없음"}</p>
                </div>
                <EdgeControls a={edge.a} b={edge.b} connected />
              </li>
            ))}
          </ul>
          {!queue.length && <p className="rounded-xl border border-line p-8 text-center text-muted">엇갈린 간선이 없습니다.</p>}
          {queue.length > QUEUE_SIZE && (
            <Pager at={queueAt} pages={queuePages} {...{ url, view, q }} label="엇갈린 간선 페이지" />
          )}
        </>
      )}

      {view === "health" && <Health {...{ bundle, byHead, edits: edits.length, settled: settled.size, url }} />}
    </section>
  );
}

/** 페이지가 100개를 넘어가므로 이전/다음만으로는 못 돈다 — 번호를 직접 넣게 한다. */
function Pager({ at, pages, url, label, view, q }: {
  at: number; pages: number; url: (c: Params) => string; label: string; view: string; q: string;
}) {
  return (
    <nav aria-label={label} className="mt-5 flex flex-wrap items-center justify-between gap-3 text-body-sm">
      {at > 1
        ? <Link href={url({ page: String(at - 1) })} className="rounded-xl border border-line px-4 py-2">이전</Link>
        : <span className="rounded-xl border border-line px-4 py-2 text-muted">이전</span>}
      <form action={BASE} className="flex items-center gap-2">
        <input type="hidden" name="view" value={view} />
        {q && <input type="hidden" name="q" value={q} />}
        <input key={`page-${at}`} name="page" defaultValue={String(at)} inputMode="numeric" aria-label={`${label} 번호`}
          className="w-20 rounded-xl border border-line bg-bg px-3 py-2 text-center tabular-nums" />
        <span className="text-muted tabular-nums">/ {pages.toLocaleString("ko-KR")}</span>
        <button className="rounded-xl border border-line px-3 py-2">이동</button>
      </form>
      {at < pages
        ? <Link href={url({ page: String(at + 1) })} className="rounded-xl border border-line px-4 py-2">다음</Link>
        : <span className="rounded-xl border border-line px-4 py-2 text-muted">다음</span>}
    </nav>
  );
}

function HeadPanel({ head, byHead, gloss, axesOf, bundle, url, detail }: {
  head: string;
  byHead: Map<string, Neighbor[]>;
  gloss: (n: string) => string;
  axesOf: (n: string) => string[];
  bundle: Awaited<ReturnType<typeof loadNeighborBundle>>;
  url: (c: Params) => string;
  detail?: boolean;
}) {
  const neighbors = byHead.get(head) ?? [];
  // 2홉은 중앙값 241개라 목록에서는 화면을 덮는다. 한 무드만 볼 때만 펼친다.
  const layers = detail ? expand(byHead, head, 2) : [];
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <strong className="text-h3 font-semibold">{head}</strong>
        {axesOf(head).map((axis) => (
          <span key={axis} className={`rounded-lg border px-2 py-0.5 text-caption ${AXIS_TONE[axis] ?? "border-line"}`}>{axis}</span>
        ))}
        <span className="text-caption text-muted">이웃 {neighbors.length}</span>
      </div>
      <p className="mt-1 text-body-sm text-muted">{gloss(head) || "뜻풀이 없음"}</p>

      <AddEdge head={head} heads={bundle.heads} />

      <ul className="mt-4 space-y-2">
        {neighbors.map((n) => (
          <li key={n.head} className="flex flex-wrap items-baseline gap-2 border-b border-line py-2 last:border-0">
            <Link href={url({ head: n.head })} className="font-medium underline-offset-2 hover:underline">{n.head}</Link>
            {n.edited === "add"
              ? <span className="rounded-lg border border-brand bg-brand/10 px-2 py-0.5 text-caption text-brand">직접 이음</span>
              : <span className="text-caption text-muted tabular-nums">{n.score.toFixed(3)}</span>}
            <span className="text-caption text-muted">{n.state === "mutual" ? "양방향" : n.state === "disagreed" ? "한쪽만 · 엇갈림"
              : n.state === "floor" ? "이웃 0개를 막으려 강제로 이음" : "한쪽만"}</span>
            {n.photos > 0 && <span className="rounded-lg border border-line px-2 py-0.5 text-caption">사진 {n.photos}</span>}
            {n.sameFirst && <span className="rounded-lg border border-amber-400 bg-amber-500/10 px-2 py-0.5 text-caption text-amber-700">첫 글자</span>}
            <span className="w-full text-caption text-muted sm:w-auto sm:flex-1">{gloss(n.head)}</span>
            <EdgeControls a={head} b={n.head} connected />
          </li>
        ))}
      </ul>
      {!neighbors.length && <p className="mt-4 rounded-xl border border-line p-6 text-center text-muted">이웃이 없습니다. 위에서 직접 이어 주세요.</p>}

      {layers.length > 0 && (
        <div className="mt-5 rounded-xl border border-line bg-fg/[0.02] p-3">
          <p className="text-caption text-muted">진단용 — 3홉이면 어휘 절반에 닿습니다. 실제 추천은 1홉을 유사도 순으로 잘라 씁니다.</p>
          {layers.map((layer, i) => (
            <p key={i} className="mt-2 text-body-sm">
              <span className="text-caption text-muted">{i + 1}홉 ({layer.length})</span>{" "}
              {layer.slice(0, 20).join(" · ")}{layer.length > 20 && ` … 외 ${layer.length - 20}개`}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Health({ bundle, byHead, edits, settled, url }: {
  bundle: Awaited<ReturnType<typeof loadNeighborBundle>>;
  byHead: Map<string, Neighbor[]>;
  edits: number;
  settled: number;
  url: (c: Params) => string;
}) {
  const sizes = components(bundle.heads, byHead);
  const isolated = bundle.heads.filter((h) => !(byHead.get(h) ?? []).length);
  const degrees = bundle.heads.map((h) => (byHead.get(h) ?? []).length).sort((a, b) => a - b);
  const median = degrees[Math.floor(degrees.length / 2)] ?? 0;
  const states = bundle.edges.reduce<Record<string, number>>((acc, e) => {
    acc[e.state] = (acc[e.state] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["간선", bundle.edges.length],
          ["이웃 수 중앙값", median],
          ["이웃 0개", isolated.length],
          ["사람이 고친 것", edits],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-line p-4">
            <p className="text-caption text-muted">{label}</p>
            <p className="mt-1 text-h3 font-semibold tabular-nums">{Number(value).toLocaleString("ko-KR")}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line p-4 text-body-sm">
        <p className="font-medium">간선의 상태</p>
        <p className="mt-1 text-muted">
          양방향 {(states.mutual ?? 0).toLocaleString("ko-KR")} ·
          한쪽만(엇갈림) {(states.disagreed ?? 0).toLocaleString("ko-KR")} ·
          한쪽만(후보 밖) {(states.unasked ?? 0).toLocaleString("ko-KR")}
          {(states.floor ?? 0) > 0 && <> · 강제로 이음 {(states.floor ?? 0).toLocaleString("ko-KR")}</>}
          {settled > 0 && <> · 사람이 정한 것 {settled.toLocaleString("ko-KR")}</>}
        </p>
        <p className="mt-2 text-caption text-muted">
          후보 밖은 상대의 top-30 에 없어 물어보지 않은 것입니다. 엇갈린 게 아니므로 그대로 잇습니다.
          판정이 전부 버려 이웃이 0개가 될 뻔한 대표는 유사도가 낮아도 가장 가까운 둘과 억지로 이어 둡니다 —
          이웃이 없으면 그 낱말로 검색한 사람에게 보여줄 게 없습니다.
        </p>
      </div>

      <div className="rounded-xl border border-line p-4 text-body-sm">
        <p className="font-medium">연결 덩어리 {sizes.length.toLocaleString("ko-KR")}개</p>
        <p className="mt-1 text-muted">큰 것부터: {sizes.slice(0, 12).map((s) => s.toLocaleString("ko-KR")).join(" · ")}{sizes.length > 12 && " …"}</p>
        <p className="mt-2 text-caption text-muted">
          섬으로 쪼개져 있으면 그 안에서는 추천이 못 빠져나갑니다. 가장 큰 덩어리가 전체의{" "}
          {((sizes[0] ?? 0) / bundle.heads.length * 100).toFixed(1)}% 입니다.
        </p>
      </div>

      {isolated.length > 0 && (
        <div className="rounded-xl border border-line p-4 text-body-sm">
          <p className="font-medium">이웃이 없는 대표 {isolated.length.toLocaleString("ko-KR")}개</p>
          <p className="mt-1 text-muted">이 무드로 검색하면 추천이 아예 안 나옵니다.</p>
          <p className="mt-2 flex flex-wrap gap-2">
            {isolated.slice(0, 40).map((h) => (
              <Link key={h} href={url({ view: "graph", head: h, q: h })} className="rounded-lg border border-line px-2 py-0.5 text-caption hover:border-fg/40">{h}</Link>
            ))}
            {isolated.length > 40 && <span className="text-caption text-muted">… 외 {isolated.length - 40}개</span>}
          </p>
        </div>
      )}
    </div>
  );
}

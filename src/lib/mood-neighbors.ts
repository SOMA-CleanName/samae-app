// 이웃 그래프 화면의 순수 로직. 파일 입출력은 mood-neighbors-data.ts 에 있다.

export type EdgeState = "mutual" | "disagreed" | "unasked";

export type Edge = {
  a: string;
  b: string;
  state: EdgeState;
  score: number;
  photos: number;      // 같은 사진에 함께 붙은 정도 × 1000
  sameFirst: boolean;  // 첫 글자가 같다 — 표기 오염 의심
};

export type Node = { senses: string[]; axes: string[]; usage: string };

export type NeighborBundle = {
  heads: string[];
  nodes: Record<string, Node>;
  edges: Edge[];
  judged: number;
};

/** 사람이 손댄 것. 자동 생성분과 따로 둔다 — 다시 만들어도 살아남아야 한다 (§9-5 의 교훈). */
export type EditAction = "add" | "remove";
export type Edit = { a: string; b: string; action: EditAction; note?: string; at: string };

/** 간선은 무향이다. 어느 쪽에서 불러도 같은 키가 나와야 한다. */
export const edgeKey = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);

export type Neighbor = Edge & { head: string; edited?: EditAction };

/**
 * 자동분에 사람 수정분을 덮어 최종 이웃을 만든다.
 * 한쪽이라도 이었으면 잇는다 — 무향이므로 한 끝이 보증하면 충분하다.
 */
export function resolveNeighbors(bundle: NeighborBundle, edits: Edit[]) {
  const removed = new Set<string>();
  const added = new Map<string, Edit>();
  for (const edit of edits) {
    const key = edgeKey(edit.a, edit.b);
    if (edit.action === "remove") { removed.add(key); added.delete(key); }
    else { added.set(key, edit); removed.delete(key); }
  }
  const byHead = new Map<string, Neighbor[]>();
  const push = (head: string, neighbor: Neighbor) => {
    const list = byHead.get(head);
    if (list) list.push(neighbor); else byHead.set(head, [neighbor]);
  };
  for (const edge of bundle.edges) {
    if (removed.has(edgeKey(edge.a, edge.b))) continue;
    push(edge.a, { ...edge, head: edge.b });
    push(edge.b, { ...edge, head: edge.a });
  }
  const auto = new Set(bundle.edges.map((e) => edgeKey(e.a, e.b)));
  for (const [key, edit] of added) {
    if (auto.has(key)) continue;   // 이미 자동분에 있다
    const edge: Edge = {
      a: edit.a, b: edit.b, state: "mutual", score: 0, photos: 0,
      sameFirst: edit.a[0] === edit.b[0],
    };
    push(edit.a, { ...edge, head: edit.b, edited: "add" });
    push(edit.b, { ...edge, head: edit.a, edited: "add" });
  }
  for (const list of byHead.values()) {
    list.sort((x, y) => y.score - x.score || x.head.localeCompare(y.head, "ko"));
  }
  return byHead;
}

/**
 * 판정이 엇갈린 간선. **전부 이어져 있고**, 검수 대상이 아니라 참고 목록이다 —
 * 전량 8,600개쯤이라 사람이 볼 수 없고, 사람이 표본을 보고 "엇갈려도 잇는 게 맞다" 고 정했다.
 * 나중에 추천이 이상할 때 먼저 의심할 자리를 찾는 데 쓴다.
 * 상대의 후보에 아예 없었던 것(unasked)은 엇갈린 게 아니므로 뺀다.
 */
export function shakyEdges(bundle: NeighborBundle, edits: Edit[]) {
  const settled = new Set(edits.map((e) => edgeKey(e.a, e.b)));
  return bundle.edges
    .filter((e) => e.state === "disagreed" && !settled.has(edgeKey(e.a, e.b)))
    .sort((x, y) => y.score - x.score);
}

/** 그래프가 몇 덩어리로 갈렸나. 섬으로 쪼개져 있으면 그 안에서는 추천이 못 돈다. */
export function components(heads: string[], byHead: Map<string, Neighbor[]>) {
  const seen = new Set<string>();
  const sizes: number[] = [];
  for (const start of heads) {
    if (seen.has(start)) continue;
    let size = 0;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const head = stack.pop()!;
      size += 1;
      for (const neighbor of byHead.get(head) ?? []) {
        if (!seen.has(neighbor.head)) { seen.add(neighbor.head); stack.push(neighbor.head); }
      }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}

/** 검색어로 시작하는 것을 앞에, 그다음 포함하는 것과 뜻풀이에 걸리는 것. */
export function searchHeads(heads: string[], nodes: Record<string, Node>, q: string, limit = 40) {
  const needle = q.trim();
  if (!needle) return [];
  const starts = heads.filter((h) => h.startsWith(needle));
  const rest = heads.filter((h) => !h.startsWith(needle)
    && (h.includes(needle) || (nodes[h]?.senses ?? []).some((s) => s.includes(needle))));
  return [...starts, ...rest].slice(0, limit);
}

/** 여러 홉을 걸어 사진이 모일 때까지 넓힌다. 실제 추천이 도는 모양을 확인하는 용도. */
export function expand(byHead: Map<string, Neighbor[]>, start: string, hops = 2) {
  const seen = new Set([start]);
  let frontier = [start];
  const layers: string[][] = [];
  for (let hop = 0; hop < hops; hop += 1) {
    const next: string[] = [];
    for (const head of frontier) {
      for (const neighbor of byHead.get(head) ?? []) {
        if (seen.has(neighbor.head)) continue;
        seen.add(neighbor.head);
        next.push(neighbor.head);
      }
    }
    if (!next.length) break;
    layers.push(next);
    frontier = next;
  }
  return layers;
}

"""Pack the neighbour graph into one committed file for the admin screen.

Same reason as the other two bundles: out/ is Git-excluded and only exists where
this was computed (§9-6).

Symmetry. The judgement is made per head, so an edge can come back one-sided, and
those split into two unlike cases:

  not a candidate  B was never in A's top-30, so A was never asked. Not a
                   disagreement — joined without review.
  disagreement     A was asked about B and dropped it while B kept A. This is the
                   ambiguous set a person has to settle.

Both are joined, because the graph is undirected and one end vouching for the edge
is enough to keep it. The disagreements are flagged so they can be reviewed, with
the ones that matter — high similarity, both ends had the other as a candidate —
sorted to the front.

Human edits live apart from the generated graph on purpose. §9-5 left a warning
that the hand-picked heads in head-overrides.tsv are *not* reapplied when the
pipeline is rerun. This graph will be rebuilt whenever the model or the vocabulary
changes, so the edits are kept as their own layer and replayed over each rebuild.
"""
import json
from pathlib import Path

import numpy as np

# 이웃이 없는 대표는 검색해도 추천이 아예 안 나온다. 판정이 전부 버렸더라도
# 유사도가 가장 높은 쪽으로 최소 이 개수만큼은 이어 둔다 — 끊어 두느니 잇는다.
MIN_DEGREE = 2

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
BUNDLE = EMBED / "mood-neighbors-bundle.json"


def load_judgments():
    rows = [json.loads(line) for line in (OUT / "neighbor-judgments.jsonl")
            .read_text(encoding="utf-8").splitlines() if line.strip()]
    return {r["head"]: r for r in rows}


def floor_edges(edges, heads, order, knn, knn_scores, cooccurrence, at):
    """이웃이 MIN_DEGREE 에 못 미치는 대표를 유사도 상위와 억지로 잇는다.

    판정은 '함께 보여줘도 되는가' 를 물었으므로 전부 버려진 대표가 나온다. 하지만
    이웃이 0개면 그 낱말로 검색한 사람에게 보여줄 게 없다. 유사도가 낮아도
    가장 가까운 것과는 이어 둬야 추천이 한 발짝이라도 나간다."""
    degree = {}
    for edge in edges.values():
        degree[edge["a"]] = degree.get(edge["a"], 0) + 1
        degree[edge["b"]] = degree.get(edge["b"], 0) + 1
    added = 0
    for head in heads:
        row = at.get(head)
        if row is None:
            continue
        for rank in range(knn.shape[1]):
            if degree.get(head, 0) >= MIN_DEGREE:
                break
            other = order[int(knn[row, rank])]
            if other == head:
                continue
            key = tuple(sorted((head, other)))
            if key in edges:
                continue
            edges[key] = {
                "a": key[0], "b": key[1], "state": "floor",
                "score": float(knn_scores[row, rank]),
                "photos": int(round(cooccurrence[at[key[0]], at[key[1]]] * 1000)),
                "sameFirst": key[0][0] == key[1][0],
            }
            degree[head] = degree.get(head, 0) + 1
            degree[other] = degree.get(other, 0) + 1
            added += 1
    return added


def build(judged, heads, senses, axes, usage, cooccurrence, order, knn, knn_scores):
    kept = {h: set(r["kept"]) for h, r in judged.items()}
    cands = {h: set(r["kept"]) | set(r["dropped"]) for h, r in judged.items()}
    score = {h: r["scores"] for h, r in judged.items()}
    at = {h: i for i, h in enumerate(order)}

    edges = {}
    for head, others in kept.items():
        for other in others:
            key = tuple(sorted((head, other)))
            if key in edges:
                continue
            mutual = other in kept and head in kept[other]
            asked = other in kept and head in cands[other]
            edges[key] = {
                "a": key[0], "b": key[1],
                # 한쪽이 상대를 후보로도 못 봤으면 엇갈린 게 아니다.
                "state": "mutual" if mutual else ("disagreed" if asked else "unasked"),
                "score": max(score.get(head, {}).get(other, 0.0),
                             score.get(other, {}).get(head, 0.0)),
                "photos": int(round(cooccurrence[at[key[0]], at[key[1]]] * 1000)) if at else 0,
                "sameFirst": key[0][0] == key[1][0],
            }
    forced = floor_edges(edges, heads, order, knn, knn_scores, cooccurrence, at)
    nodes = {h: {"senses": senses.get(h, [])[:2], "axes": axes.get(h, []), "usage": usage.get(h, "")}
             for h in heads}
    return {"heads": heads, "nodes": nodes, "edges": sorted(edges.values(), key=lambda e: -e["score"]),
            "judged": len(judged), "forced": forced}


def main():
    review = json.loads((EMBED / "mood-review-bundle.json").read_text(encoding="utf-8"))
    axes_bundle = json.loads((EMBED / "mood-axes-bundle.json").read_text(encoding="utf-8"))
    order = json.loads((OUT / "head-order.json").read_text(encoding="utf-8"))
    co = np.load(OUT / "head-cooccurrence.npy")
    knn = np.load(OUT / "head-neighbors.npy")
    knn_scores = np.load(OUT / "head-neighbor-scores.npy")
    judged = load_judgments()
    heads = [g["head"] for g in axes_bundle["groups"]]
    senses = {w: v["senses"] for w, v in review["senses"].items()}
    bundle = build(judged, heads,
                   senses,
                   {g["head"]: g["axes"] for g in axes_bundle["groups"]},
                   {g["head"]: g["usage"] for g in axes_bundle["groups"]},
                   co, order, knn, knn_scores)
    BUNDLE.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    states = {}
    for e in bundle["edges"]:
        states[e["state"]] = states.get(e["state"], 0) + 1
    print(json.dumps({"judged": bundle["judged"], "edges": len(bundle["edges"]), **states,
                      "forced": bundle["forced"],
                      "size_mb": round(BUNDLE.stat().st_size / 1_048_576, 2)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

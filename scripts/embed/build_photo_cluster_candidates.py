"""사진 무드 표현 뼈대 — 무리(D3) 후보 (docs/40 §16-4 · §17-5, 2026-09-23).

묶음(photo-groups.json)은 그대로 두고 그 위에 "거의 같은 것" 의 층을 둔다. 후보는 옛 방식(build_cluster_candidates.py) 그대로 두 갈래:
  root     검색어의 어미를 떼고 된소리 · 모음 짝을 맞춘 뿌리가 서로 다른 묶음에서 겹치는 곳(깜박이는 · 껌벅이는)
  similar  판정에서 한쪽이 "같은 말" 로 고른 쌍(일몰 → 노을: 상대 이웃 10개에 못 들어 서로 고르지 못한 것 — 거의 같음의 가장 센 신호),
           그리고 묶음 벡터(식구 평균)끼리 코사인 0.85 이상인데 root 에 없는 쌍. 0.75 는 용례 벡터에서 너무 낮다(1,371쌍, 겨울꽃 · 봄꽃 0.93).
무리는 사람이 화면(/admin/photo-purpose/mood/cluster/photo)에서 확정한다. 무리에는 대표가 없다.
묶음의 이름(head)은 식구 중 작가 사진이 가장 많은 말 — 화면 표시용이지 대표가 아니다.

  py build_photo_cluster_candidates.py  →  mood-edits/photo-cluster-candidates.json {cases:[{id, kind, reason, groups:[{head, label, axes, usage, terms}]}]}
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_cluster_candidates import root

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
EDITS = EMBED / "mood-edits"
SIMILAR = 0.85


def load():
    terms = {r["term"]: r for r in (json.loads(l) for l in (OUT / "photo-terms.jsonl").read_text(encoding="utf-8").splitlines() if l.strip())}
    order = [r["term"] for r in (json.loads(l) for l in (OUT / "photo-judge.jsonl").read_text(encoding="utf-8").splitlines() if l.strip())]
    V = np.load(OUT / "photo-term-vectors.npy").astype(np.float32)
    idx = {t: i for i, t in enumerate(order)}
    try:                                                                  # 흡수된 표기의 대표가 벡터 목록에 없으면(해 질 녘 → 해질녘) 변형의 벡터를 쓴다
        for l in (EDITS / "photo-term-merges.jsonl").read_text(encoding="utf-8").splitlines():
            if l.strip():
                m = json.loads(l)
                if m["to"] not in idx and m["from"] in idx:
                    idx[m["to"]] = idx[m["from"]]
    except FileNotFoundError:
        pass
    groups = json.loads((EDITS / "photo-groups.json").read_text(encoding="utf-8"))
    return terms, V, idx, groups


def group_vectors(groups, V, idx):
    G = np.stack([V[[idx[t] for t in g["members"] if t in idx]].mean(axis=0) for g in groups])
    G /= np.linalg.norm(G, axis=1, keepdims=True) + 1e-9
    return G


def main():
    terms, V, idx, data = load()
    groups = data["groups"]
    heads = [g["members"][0] for g in groups]
    head_of = {t: h for g, h in zip(groups, heads) for t in g["members"]}

    def card(h, key=None):
        g = groups[heads.index(h)]
        axes = sorted({a for t in g["members"] for a in terms.get(t, {}).get("axes", [])})
        return {"head": h, "label": h, "axes": axes, "usage": terms.get(h, {}).get("usage", ""),
                "terms": [{"term": t, "gloss": terms.get(t, {}).get("usage", ""), **({"hit": True} if key and root(t) == key else {})}
                          for t in g["members"]]}

    by_root = defaultdict(set)
    for h, g in zip(heads, groups):
        for t in g["members"]:
            k = root(t)
            if len(k) >= 2:
                by_root[k].add(h)
    cases, covered = [], set()
    for k, hs in sorted(by_root.items()):
        if len(hs) < 2:
            continue
        hs = sorted(hs)
        covered |= {(a, b) for a in hs for b in hs if a < b}
        cases.append({"id": f"r{len(cases) + 1:03d}", "kind": "root", "reason": f"글자가 비슷해서 모인 후보 ({k})", "groups": [card(h, k) for h in hs]})

    G = group_vectors(groups, V, idx)
    S = G @ G.T
    np.fill_diagonal(S, -9)
    pairs = {}
    for a, b in data.get("relations", []):                                     # 판정에서 한쪽이 고른 쌍(묶음 사이) — 가장 센 신호라 먼저
        ha, hb = head_of.get(a), head_of.get(b)
        if ha and hb and ha != hb:
            key = tuple(sorted((ha, hb)))
            score = float(S[heads.index(ha), heads.index(hb)])
            prev = pairs.get(key)
            pairs[key] = (max(score, prev[0]) if prev else score, f"한쪽이 고름 ({a} → {b})" if not prev else "양쪽 다 한쪽씩 고름")
    for i, j in zip(*np.where(np.triu(S, 1) >= SIMILAR)):
        a, b = sorted((heads[i], heads[j]))
        pairs.setdefault((a, b), (float(S[i, j]), "유사도"))
    n = 0
    for (a, b), (score, how) in sorted(pairs.items(), key=lambda kv: (kv[1][1] == "유사도", -kv[1][0])):
        if (a, b) in covered:
            continue
        n += 1
        cases.append({"id": f"s{n:03d}", "kind": "similar", "reason": f"{how} · 유사도 {score:.2f}", "groups": [card(a), card(b)]})

    hints = {}                                                            # AI 1차 판정(judge_photo_clusters.py) — 묶음 이름 집합이 같은 후보에 붙인다
    try:
        for l in (EDITS / "photo-cluster-ai.jsonl").read_text(encoding="utf-8").splitlines():
            if l.strip():
                x = json.loads(l)
                hints[frozenset(x["heads"])] = {k: x[k] for k in ("verdict", "why", "members") if k in x}
    except FileNotFoundError:
        pass
    ai = defaultdict(int)
    for c in cases:
        h = hints.get(frozenset(g["head"] for g in c["groups"]))
        if h:
            c["ai"] = h
        ai[h["verdict"] if h else "none"] += 1
    (EDITS / "photo-cluster-candidates.json").write_text(json.dumps({"cases": cases}, ensure_ascii=False), encoding="utf-8")
    kinds = defaultdict(int)
    for c in cases:
        kinds[c["kind"]] += 1
    print(f"묶음 {len(groups)} · 후보 {len(cases)} {dict(kinds)} · AI {dict(ai)}")
    for c in cases[:8]:
        print("  ", c["id"], c["reason"], "|", " / ".join(" · ".join(t["term"] for t in g["terms"]) for g in c["groups"]))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

"""사진 무드 표현 뼈대 — 가족(D4) · 큰 무드(D5) 뭉치기 (docs/40 §16-1 · §16-2 · §17-5, 2026-09-29).

이웃 그래프(photo-neighbors.json)에 무게를 주고 덩어리를 찾는다. §16-2 6번 그대로:
  서로 고름 1.0 · 엇갈림 0.55 · 후보 밖 0.35 · 억지 0.15 — 판정이 셀수록 무겁다
  축이 하나도 안 겹치면서 서로 고른 게 아니면 ×0.5 (축으로 가족을 정하는 게 아니라 잡음 간선을 약하게 만드는 것)
  벡터 유사도로 (0.5 + 0.5 × 코사인)
  허브는 낮춘다 — 이웃이 많은 묶음에 닿는 간선은 √(이웃 수) 로 나눈다(소프트한 100 · 그림 같은 96 이 다 녹지 않게)
  같은 무리(photo-clusters.json)는 2.0 을 더해 늘 한 가족에 남는다
가족은 축과 상관없이 뭉친다(§16-2 4번) — 축은 결과로 따라와 세어 보여 줄 뿐이다. 가족에는 대표가 없다. 이름은 사람이 화면에서 붙인다.
큰 무드(D5)는 가족끼리의 무게를 모아 한 번 더 뭉친 것 — 가족이 통째로 들어가므로 층이 어긋나지 않는다.
부모는 여럿을 허용한다(§16-2 2번): 제 가족 말고 다른 가족에 제 무게의 SHARE 이상 걸친 묶음은 손님으로 적는다. 대표 부모는 제 가족.

  py build_photo_families.py [해상도] [큰무드해상도]   →  mood-edits/photo-families.json
"""
import collections
import datetime
import json
import math
import sys
from pathlib import Path

import networkx as nx
from networkx.algorithms.community import louvain_communities

EDITS = Path(__file__).resolve().parent / "mood-edits"
BASE = {"mutual": 1.0, "disagreed": 0.55, "unasked": 0.35, "floor": 0.15}
RESOLUTION, BIG_RESOLUTION, SHARE, SEED = 8.0, 1.0, 0.5, 7


def build_graph(bundle, clusters):
    nodes, heads = bundle["nodes"], bundle["heads"]
    deg = collections.Counter()
    for e in bundle["edges"]:
        deg[e["a"]] += 1
        deg[e["b"]] += 1
    med = sorted(deg.values())[len(deg) // 2] or 1
    G = nx.Graph()
    G.add_nodes_from(heads)
    for e in bundle["edges"]:
        w = BASE.get(e["state"], 0.3)
        if not (set(nodes[e["a"]]["axes"]) & set(nodes[e["b"]]["axes"])) and e["state"] != "mutual":
            w *= 0.5
        w *= 0.5 + 0.5 * max(0.0, e.get("score", 0.7))
        w *= min(1.0, (med / math.sqrt(deg[e["a"]] * deg[e["b"]])) ** 0.5)
        G.add_edge(e["a"], e["b"], weight=w)
    for c in clusters:                                                    # 같은 무리는 떨어지지 않는다
        ms = [m for m in c["members"] if m in G]
        for i, a in enumerate(ms):
            for b in ms[i + 1:]:
                G.add_edge(a, b, weight=G.get_edge_data(a, b, {}).get("weight", 0) + 2.0)
    return G


def main():
    res = float(sys.argv[1]) if len(sys.argv) > 1 else RESOLUTION
    big_res = float(sys.argv[2]) if len(sys.argv) > 2 else BIG_RESOLUTION
    bundle = json.loads((EDITS / "photo-neighbors.json").read_text(encoding="utf-8"))
    try:
        clusters = json.loads((EDITS / "photo-clusters.json").read_text(encoding="utf-8"))["clusters"]
    except FileNotFoundError:
        clusters = []
    nodes = bundle["nodes"]
    G = build_graph(bundle, clusters)

    parts = sorted(louvain_communities(G, weight="weight", resolution=res, seed=SEED), key=len, reverse=True)
    fam_of = {h: f"f{i + 1:02d}" for i, part in enumerate(parts) for h in part}
    members = {f"f{i + 1:02d}": sorted(part, key=lambda h: (-len(nodes[h]["members"]), h)) for i, part in enumerate(parts)}

    A = nx.Graph()                                                        # 가족끼리의 무게를 모아 큰 무드로
    A.add_nodes_from(members)
    for a, b, d in G.edges(data=True):
        fa, fb = fam_of[a], fam_of[b]
        if fa != fb:
            A.add_edge(fa, fb, weight=A.get_edge_data(fa, fb, {}).get("weight", 0) + d["weight"])
    big = sorted(louvain_communities(A, weight="weight", resolution=big_res, seed=SEED), key=len, reverse=True)
    big_of = {f: f"m{i + 1:02d}" for i, part in enumerate(big) for f in part}

    guests = collections.defaultdict(list)                                # 부모는 여럿 — 제 가족 무게의 SHARE 이상 걸친 곳
    for h in G:
        tie = collections.Counter()
        for nb in G[h]:
            tie[fam_of[nb]] += G[h][nb]["weight"]
        own = tie[fam_of[h]]
        for f, w in tie.items():
            if f != fam_of[h] and own > 0 and w >= SHARE * own:
                guests[f].append({"head": h, "home": fam_of[h], "share": round(w / own, 2)})

    families = []
    for fid, ms in members.items():
        axes = collections.Counter(a for h in ms for a in nodes[h]["axes"])
        families.append({"id": fid, "big": big_of[fid], "members": ms,
                         "terms": sum(len(nodes[h]["members"]) for h in ms),
                         "axes": [[a, n] for a, n in axes.most_common()],
                         "guests": sorted(guests.get(fid, []), key=lambda g: -g["share"])})
    out = {"made_at": datetime.date.today().isoformat(), "resolution": res, "big_resolution": big_res,
           "weights": {**BASE, "축 안 겹치고 한쪽만": 0.5, "같은 무리": 2.0, "손님 문턱": SHARE},
           "families": families,
           "moods": [{"id": f"m{i + 1:02d}", "families": sorted(part)} for i, part in enumerate(big)]}
    (EDITS / "photo-families.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    sizes = collections.Counter(len(f["members"]) for f in families)
    print(f"묶음 {G.number_of_nodes()} · 간선 {G.number_of_edges()} · 해상도 {res} → 가족 {len(families)} "
          f"(식구 수 중간값 {sorted(len(f['members']) for f in families)[len(families) // 2]} · 최대 {max(sizes)}) · 큰 무드 {len(big)} · 손님 {sum(len(f['guests']) for f in families)}")
    for f in families[:10]:
        print(f"  {f['id']} [{f['big']}] {len(f['members'])} · " + " · ".join(f["members"][:12]))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

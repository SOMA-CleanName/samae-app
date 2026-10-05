"""사진 무드 표현 뼈대의 묶음(D2) 만들기 — 서로 고른 짝 + 밀도 병합 (docs/40 §17-5, 2026-09-23).

에이전트 판정(oNNN.jsonl: term 이 same 에 고른 이웃)에서
  1. 서로 고른 짝(a→b 이고 b→a)만 간선으로 쓴다. 한쪽만 고른 짝은 relations 로 남긴다(다음 층 재료).
  2. 간선을 벡터 유사도 순으로 보며 두 덩이를 합친다 — 덩이 사이 서로 고른 짝 비율 ≥ 0.5 이고 합친 크기 ≤ 20 일 때만.
     (그냥 이으면 큰 덩이 하나가 된다 — §17-5.) 묶음에는 대표가 없다. 식구만 있다.

  py build_photo_groups.py <조각 폴더>   →  mood-edits/photo-groups.json {terms, groups:[{members}], relations:[[a,b]]}

묶음 안 같은 낱말의 다른 표기(mood-edits/photo-term-merges.jsonl, find_photo_term_merges.py)는 대표 이름으로 접는다 — 판정은 옛 이름으로 했으니
읽을 때 이름만 바꾸고, 식구 · 한쪽만 고른 짝에서 겹치는 것을 지운다. 조각 폴더는 wNNN/oNNN.jsonl 이든 oNNN.jsonl 바로든 된다.
"""
import json
import sys
from pathlib import Path

import numpy as np

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
DENSITY = 0.5
MAX_SIZE = 20


def main():
    chunks = Path(sys.argv[1])
    rows = [json.loads(l) for l in (OUT / "photo-judge.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    terms = [r["term"] for r in rows]
    idx = {t: i for i, t in enumerate(terms)}
    V = np.load(OUT / "photo-term-vectors.npy").astype(np.float32)
    photos = {r["term"]: r.get("photos", 0) or 0                       # 식구 순서는 작가 사진 많은 순 — 대표는 아니다
              for r in (json.loads(l) for l in (OUT / "photo-terms.jsonl").read_text(encoding="utf-8").splitlines() if l.strip())}

    picks: dict[str, set[str]] = {}
    judged = 0
    for o in sorted(list(chunks.glob("w[0-9][0-9][0-9]/o[0-9][0-9][0-9].jsonl")) + list(chunks.glob("o[0-9][0-9][0-9].jsonl"))):
        for l in o.read_text(encoding="utf-8").splitlines():
            if not l.strip():
                continue
            x = json.loads(l)
            if x["term"] not in idx:
                continue
            judged += 1
            picks.setdefault(x["term"], set()).update(t for t in x.get("same", []) if t in idx and t != x["term"])

    edges, relations = [], []
    for a, bs in picks.items():
        for b in bs:
            if a in picks.get(b, set()):
                if a < b:
                    edges.append((float(V[idx[a]] @ V[idx[b]]), a, b))
            else:
                relations.append([a, b])
    edges.sort(reverse=True)
    mutual = {(a, b) for _, a, b in edges} | {(b, a) for _, a, b in edges}

    parent = {t: t for t in terms}
    members = {t: {t} for t in terms}

    def find(t):
        while parent[t] != t:
            parent[t] = parent[parent[t]]
            t = parent[t]
        return t

    for _, a, b in edges:
        ra, rb = find(a), find(b)
        if ra == rb:
            continue
        A, B = members[ra], members[rb]
        if len(A) + len(B) > MAX_SIZE:
            continue
        cross = sum((x, y) in mutual for x in A for y in B)
        if cross / (len(A) * len(B)) < DENSITY:
            continue
        parent[rb] = ra
        members[ra] = A | B
        del members[rb]

    canon = {}                                                            # 같은 낱말의 다른 표기 → 대표(끝까지 따라간다)
    try:
        for l in (EMBED / "mood-edits" / "photo-term-merges.jsonl").read_text(encoding="utf-8").splitlines():
            if l.strip():
                m = json.loads(l)
                if m["from"] not in photos:                                   # 화면(mergePhotoTerms)이 실제로 흡수한 것만 — 사람이 그 이름으로 살린 말은 남는다
                    canon[m["from"]] = m["to"]
    except FileNotFoundError:
        pass

    def name(t):
        seen = set()
        while t in canon and t not in seen:
            seen.add(t)
            t = canon[t]
        return t

    def fold(g):
        out = []
        for t in g:
            if name(t) not in out:
                out.append(name(t))
        return out

    all_terms = fold(terms)
    folded = [fold(sorted(m, key=lambda t: (-int(photos.get(t, 0)), t))) for m in members.values()]
    owner = {}                                                            # 묶음 밖 흡수로 두 묶음이 한 이름을 나누면 그 묶음들을 합친다
    gparent = list(range(len(folded)))

    def gfind(i):
        while gparent[i] != i:
            i = gparent[i]
        return i

    for i, g in enumerate(folded):
        for t in g:
            if t in owner:
                gparent[gfind(i)] = gfind(owner[t])
            else:
                owner[t] = i
    merged = {}
    for i, g in enumerate(folded):
        merged.setdefault(gfind(i), []).extend(t for t in g if t not in merged.get(gfind(i), []))
    groups = sorted((sorted(g, key=lambda t: (-int(photos.get(t, 0)), t)) for g in merged.values()), key=lambda g: (-len(g), g[0]))
    relations = sorted({(name(a), name(b)) for a, b in relations if name(a) != name(b)})
    multi = [g for g in groups if len(g) > 1]
    sizes = {}
    for g in groups:
        sizes[len(g)] = sizes.get(len(g), 0) + 1
    out = {"made_at": __import__("datetime").date.today().isoformat(), "terms": len(all_terms), "judged": judged, "absorbed": len(terms) - len(all_terms),
           "mutual_edges": len(edges), "groups": [{"members": g} for g in groups], "relations": [list(r) for r in relations]}
    (EMBED / "mood-edits" / "photo-groups.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"검색어 {len(terms)} → 흡수 뒤 {len(all_terms)} · 판정 {judged} · 서로 고른 짝 {len(edges)} · 한쪽만 {len(relations)}")
    print(f"묶음 {len(groups)} (둘 이상 {len(multi)}) · 크기별 {dict(sorted(sizes.items()))}")
    for g in multi[:12]:
        print("  " + " · ".join(g))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

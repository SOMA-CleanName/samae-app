"""무리(D3) 층 만들기 — /admin/photo-purpose/mood/cluster 에서 "무리로 묶기" 로 정한 것으로.

  python build_mood_clusters.py        → mood-clusters-bundle.json

묶음(D2)은 건드리지 않는다. 무리는 그 위의 층일 뿐이라, 틀리면 화면에서 "묶지 않음" 으로 바꾸고
이 스크립트를 다시 돌리면 된다.

사람이 정한 것이 있으면 그것을, 없으면 에이전트 1차 검수(cluster-candidates.json 의 ai)를 쓴다.
에이전트가 애매함(unsure)으로 넘긴 것은 사람이 정하기 전까지 무리에 넣지 않는다.

후보마다 따로 정했으므로 한 묶음이 두 후보에 걸칠 수 있다(깜박이는 · 껌벅이는 / 껌벅이는 · 끔벅한).
둘 다 무리로 정했다면 한 무리로 잇는다 — 사람이 두 번 다 "거의 같다" 고 했기 때문이다.
무리에는 대표가 없다(사람 결정, 2026-09-22). 번호와 식구 묶음만 둔다.
"""
import json
import sys
from pathlib import Path

EMBED = Path(__file__).resolve().parent
REVIEWS = EMBED / "mood-edits" / "cluster-review.jsonl"
CANDIDATES = EMBED / "mood-edits" / "cluster-candidates.json"
TERMS = EMBED / "mood-terms-bundle.json"
OUT = EMBED / "mood-clusters-bundle.json"


def build(reviews, heads, cases=()):
    latest = {}
    for c in cases:                             # 에이전트 판정은 가장 먼저 깔린다 — 사람 판정이 덮는다
        ai = c.get("ai") or {}
        if ai.get("verdict") in ("group", "keep"):
            latest[c["id"]] = {"id": c["id"], "verdict": ai["verdict"], "members": ai.get("members", []), "at": "0"}
    for r in reviews:
        latest[r["id"]] = r                      # 같은 후보는 마지막 판정만 산다
    decided = [r for r in latest.values() if r["verdict"] == "group" and len(r.get("members", [])) > 1]
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for r in decided:
        members = [h for h in r["members"] if h in heads]
        for h in members[1:]:
            a, b = find(members[0]), find(h)
            if a != b:
                parent[b] = a
    groups = {}
    for x in list(parent):
        groups.setdefault(find(x), []).append(x)
    members = sorted(sorted(ms) for ms in groups.values() if len(ms) > 1)
    members.sort(key=len, reverse=True)
    clusters = [{"id": f"m{n:03d}", "members": ms} for n, ms in enumerate(members, 1)]
    return clusters


def main():
    reviews = [json.loads(l) for l in REVIEWS.read_text(encoding="utf-8").splitlines() if l.strip()] if REVIEWS.exists() else []
    rows = json.loads(TERMS.read_text(encoding="utf-8"))["rows"]
    heads = {r["head"] for r in rows}
    cases = json.loads(CANDIDATES.read_text(encoding="utf-8"))["cases"] if CANDIDATES.exists() else []
    clusters = build(reviews, heads, cases)
    of = {h: c["id"] for c in clusters for h in c["members"]}
    OUT.write_text(json.dumps({"clusters": clusters, "of": of}, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"reviews": len(reviews), "clusters": len(clusters), "groups_in_clusters": len(of)}, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

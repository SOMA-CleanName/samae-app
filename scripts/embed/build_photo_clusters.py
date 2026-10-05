"""사진 무드 표현 뼈대 — 무리(D3) 층 만들기 (docs/40 §16-4 · §17-5, 2026-09-23 · 24).

사람 판정(mood-edits/photo-cluster-review.jsonl, 후보마다 마지막 줄이 이긴다)에서 "무리로 묶기" 한 묶음들을 잇는다.
사람 판정이 없는 후보는 AI 1차 판정(photo-cluster-candidates.json 의 ai, judge_photo_clusters.py — 사람 결정 2026-09-24: "AI가 묶은 대로 간다")을 쓴다. 애매(unsure)는 안 묶는다.

사슬 막기 — 짝마다 "거의 같다" 는 판정이 그대로 이어지면 VHS ≈ 날것 느낌 ≈ … ≈ 러브러브한 같은 사슬이 된다(생각 끈 모델은 65개짜리, 켠 모델도 9개짜리).
그래서 짝을 유사도 높은 순으로 보며, 합친 뒤 무리 안 **모든 묶음 쌍의 벡터 코사인 ≥ MIN_LINK(0.70)** 이고 크기 ≤ MAX_SIZE(9) 일 때만 잇는다.
같은 뿌리 · 소리 변형 후보(root: 내추럴 · 네추럴)는 벡터가 달라도 잇는다(용례가 달라 코사인이 낮다). 못 이은 짝은 rejected 에 남긴다.
묶음 · 이웃 그래프는 건드리지 않는다. 무리에는 대표가 없다.

  py build_photo_clusters.py  →  mood-edits/photo-clusters.json {clusters:[{members:[묶음 head]}], reviewed, by_me, by_ai, grouped, rejected}
"""
import json
import re
import sys
from pathlib import Path

from build_photo_cluster_candidates import group_vectors, load

EDITS = Path(__file__).resolve().parent / "mood-edits"
MIN_LINK = 0.70
MAX_SIZE = 9


def main():
    terms, V, idx, data = load()
    groups = data["groups"]
    heads = [g["members"][0] for g in groups]
    hi = {h: i for i, h in enumerate(heads)}
    G = group_vectors(groups, V, idx)
    S = G @ G.T

    cases = {c["id"]: c for c in json.loads((EDITS / "photo-cluster-candidates.json").read_text(encoding="utf-8"))["cases"]}
    reviews = {}
    for c in cases.values():                                              # AI 1차 판정 — 사람 판정이 덮어쓴다
        ai = c.get("ai") or {}
        if ai.get("verdict") in ("group", "keep"):
            reviews[c["id"]] = {"id": c["id"], "verdict": ai["verdict"], "members": ai.get("members") or [g["head"] for g in c["groups"]], "by": "ai"}
    p = EDITS / "photo-cluster-review.jsonl"
    if p.exists():
        for l in p.read_text(encoding="utf-8").splitlines():
            if l.strip():
                r = json.loads(l)
                reviews[r["id"]] = {**r, "by": "me"}

    def score(r):
        m = re.search(r"유사도 ([0-9.]+)", cases.get(r["id"], {}).get("reason", ""))
        return float(m.group(1)) if m else 1.0

    parent, members = {}, {}

    def find(x):
        parent.setdefault(x, x)
        members.setdefault(x, {x})
        while parent[x] != x:
            x = parent[x]
        return x

    grouped, rejected = 0, []
    for r in sorted((r for r in reviews.values() if r["verdict"] == "group" and len(r.get("members", [])) >= 2), key=score, reverse=True):
        ms = [m for m in r["members"] if m in hi]
        if len(ms) < 2:
            continue
        roots = {find(m) for m in ms}
        merged = set().union(*(members[x] for x in roots))
        is_root = cases.get(r["id"], {}).get("kind") == "root"
        tight = is_root or all(S[hi[a], hi[b]] >= MIN_LINK for a in merged for b in merged if a < b)
        if not tight or len(merged) > MAX_SIZE:
            rejected.append({"id": r["id"], "members": ms, "why": "크기" if len(merged) > MAX_SIZE else "벡터가 멀다"})
            continue
        grouped += 1
        r0 = find(ms[0])
        for x in roots:
            if x != r0:
                parent[x] = r0
        members[r0] = merged
    clusters = [sorted(c) for c in {find(m): members[find(m)] for m in list(parent)}.values() if len(c) >= 2]
    mine = sum(1 for r in reviews.values() if r["by"] == "me")
    out = {"reviewed": len(reviews), "by_me": mine, "by_ai": len(reviews) - mine, "grouped": grouped, "rejected": rejected,
           "clusters": [{"members": c} for c in sorted(clusters, key=lambda c: (-len(c), c[0]))]}
    (EDITS / "photo-clusters.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    sizes = {}
    for c in clusters:
        sizes[len(c)] = sizes.get(len(c), 0) + 1
    print(f"판정 {len(reviews)}(사람 {mine} · AI {len(reviews) - mine}) · 묶기 {grouped} · 사슬이라 안 이음 {len(rejected)} · 무리 {len(clusters)} 크기별 {dict(sorted(sizes.items()))}")
    for c in out["clusters"][:10]:
        print("  " + " ≈ ".join(c["members"]))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

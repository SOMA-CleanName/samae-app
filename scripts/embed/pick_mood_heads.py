"""Pick the word a person would actually search for, for each cluster.

Two signals, in this order:

1. The head must sit near the middle of its own cluster. Ranking on the
   dictionary's vocabulary level alone lets a broad easy word hijack a group it
   does not mean — 단순(초급) beat 뚜렷하다 for the "또렷하다" family, and 성 beat
   화나다 for anger. Centroid distance settles that before level is consulted.
2. Among the words that do sit near the middle, the easier one wins. No frequency
   corpus was collected (docs/40 §1), so the dictionary's level stands in for
   "more common", and the report says so rather than claiming a usage ranking.

Ties break on part of speech before length: 고요하다 heads its cluster, not 고요히,
because an adverb reads as an inflection of the adjective.
"""
import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
LEVEL = {"초급": 0, "중급": 1, "고급": 2, "없음": 3}
# 부사·관형사는 대표형의 활용으로 읽힌다. 형용사·명사가 무리를 대표한다.
POS = {"형용사": 0, "명사": 0, "동사": 1, "관형사": 2, "부사": 3}
MARGIN = 0.02   # 중심에 가장 가까운 낱말과 이만큼 안쪽이면 "중심에 있다"고 본다


def profile(pool):
    out = {}
    for item in pool["items"]:
        levels = {d["metadata"].get("vocabularyLevel") for d in item["dictionary"]}
        parts = {d["metadata"].get("partOfSpeech") for d in item["dictionary"]}
        out[item["label"]] = (
            min((LEVEL[l] for l in levels if l in LEVEL), default=3),
            min((POS.get(p, 2) for p in parts if p), default=2))
    return out


def centroid(vectors):
    total = [sum(col) for col in zip(*vectors)]
    scale = sum(x * x for x in total) ** 0.5 or 1.0
    return [x / scale for x in total]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def head(words, prompt_of, vectors, prof, margin=MARGIN):
    """Nearest-the-middle first, then easiest."""
    if len(words) == 1:
        return words[0], {words[0]: 1.0}
    middle = centroid([vectors[prompt_of[w]] for w in words])
    near = {w: dot(vectors[prompt_of[w]], middle) for w in words}
    cutoff = max(near.values()) - margin
    central = [w for w in words if near[w] >= cutoff]
    chosen = min(central, key=lambda w: (*prof.get(w, (3, 2)), len(w), w))
    return chosen, near


def build(clusters, prompt_of, vectors, prof, layer="0.91"):
    groups = []
    for group in clusters["layers"][layer]:
        words = group["words"]
        chosen, near = head(words, prompt_of, vectors, prof)
        groups.append({
            "head": chosen,
            "level": prof.get(chosen, (3, 2))[0],
            "centrality": round(near[chosen], 4),
            "members": sorted((w for w in words if w != chosen), key=lambda w: -near[w]),
            "prompts": group["prompts"]})
    groups.sort(key=lambda g: (-len(g["members"]), g["head"]))
    return groups


def main():
    layer = sys.argv[1] if len(sys.argv) > 1 else "0.91"
    prof = profile(json.loads((OUT / "priority-pool.json").read_text(encoding="utf-8")))
    prompt_of = {r.split("\t")[1]: r.split("\t")[2] for r in
                 (OUT / "mood-prompts.tsv").read_text(encoding="utf-8").splitlines() if r.strip()}
    vectors = json.loads((OUT / "mood-vectors.json").read_text(encoding="utf-8"))["vectors"]
    clusters = json.loads((OUT / "mood-clusters.json").read_text(encoding="utf-8"))
    groups = build(clusters, prompt_of, vectors, prof, layer)
    (OUT / f"mood-heads-{layer}.json").write_text(
        json.dumps({"layer": layer, "groups": groups}, ensure_ascii=False), encoding="utf-8")
    counts = {}
    for g in groups:
        counts[g["level"]] = counts.get(g["level"], 0) + 1
    print(json.dumps({"layer": layer, "groups": len(groups),
                      "heads_by_level": {["초급", "중급", "고급", "없음"][k]: v
                                         for k, v in sorted(counts.items())}}, ensure_ascii=False))


if __name__ == "__main__":
    main()

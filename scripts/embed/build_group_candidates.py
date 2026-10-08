"""비슷한 말 다시 묶기(D2 묶음) 후보 — 축을 붙인 뒤 (docs/40 §17-5, 2026-09-22).

묶음의 기준은 옛 묶음과 같다: **같은 뜻 — 서로 바꿔 써도 사진이 같다**(§16-1). 여기서는 판정할 후보만 만든다.

  단위      같은 말 식구(build_word_families.py). 식구는 이미 한 말이라 통째로 움직인다
  벡터      식구 낱말들의 "낱말: 뜻풀이" 벡터(qwen3-embedding:8b, screen-vectors) 평균. 풀에 없는 낱말(사진 태그 등)은 여기서 임베딩
  이웃      코사인 상위 K, 축이 하나라도 겹치는 것만(축을 먼저 붙인 까닭)
  후보 뭉치  서로 고른 이웃 중 유사도 선 위를 이은 덩어리. 너무 크면 선을 올려 쪼갠다

기존 묶음(검색어 번들 2,731)은 건드리지 않는다 — 기존 묶음 둘은 한 뭉치에 들어와도 서로 합치지 않고,
새 낱말이 기존 묶음과 같은 뜻이면 "그 묶음과 같다" 고 적기만 한다(판정 단계).

  --calibrate   기존 묶음을 정답으로 유사도 분포만 본다
출력: out/mood-vocabulary/group-units.json · group-candidates.jsonl
"""
import json
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
EXTRA = OUT / "extra-vectors.npz"
K = 15
LINE = 0.80          # 서로 고른 이웃을 잇는 유사도 선
MAX_SET = 12         # 후보 뭉치가 이보다 크면 선을 올려 쪼갠다


def embed(texts):
    body = json.dumps({"model": "qwen3-embedding:8b", "input": texts}).encode()
    req = urllib.request.Request("http://127.0.0.1:11434/api/embed", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        v = np.asarray(json.loads(r.read())["embeddings"], dtype=np.float32)
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def load_units():
    words = json.loads((EMBED / "mood-screen-list.json").read_text(encoding="utf-8"))["words"]
    by_w = {w["w"]: w for w in words}
    families = json.loads((OUT / "word-families.json").read_text(encoding="utf-8"))["families"]
    units, seen = [], set()
    for f in families:
        members = [m for m in f["members"] if m in by_w]
        if members:
            units.append(members)
            seen.update(members)
    units += [[w] for w in by_w if w not in seen]          # 식구 계산 뒤에 들어온 말(향 되살림)

    old = {}                                                # 낱말 → 기존 묶음 번호
    for gi, row in enumerate(json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))["rows"]):
        if not row.get("added") and row["axes"]:
            for w in [row["head"], *row["terms"], *row["aliases"]]:
                old.setdefault(w, gi)
    return words, by_w, units, old


def unit_vectors(units, by_w):
    row_of = {}
    with (OUT / "screen-pool.jsonl").open(encoding="utf-8") as f:
        for i, line in enumerate(f):
            row_of.setdefault(json.loads(line)["word"], i)
    parts = sorted((OUT / "screen-vectors").glob("part-*.npy"))
    mats = [np.load(p, mmap_mode="r") for p in parts]
    size = mats[0].shape[0]

    def pool_vec(w):
        for x in [w, *by_w[w].get("alt", [])]:
            if x in row_of:
                i = row_of[x]
                return np.asarray(mats[i // size][i % size], dtype=np.float32)
        return None

    extra = dict(np.load(EXTRA)) if EXTRA.exists() else {}
    need = [w for u in units for w in u if w not in extra and pool_vec(w) is None]
    if need:
        texts = [f"{w}: {by_w[w].get('why') or w}" for w in need]
        vecs = np.concatenate([embed(texts[i:i + 32]) for i in range(0, len(texts), 32)])
        extra.update(zip(need, vecs))
        np.savez(EXTRA, **extra)
        print(f"풀에 없는 낱말 {len(need)}개 임베딩")

    V = np.zeros((len(units), mats[0].shape[1]), dtype=np.float32)
    for ui, u in enumerate(units):
        vs = [v for v in (pool_vec(w) if w not in extra else extra[w] for w in u) if v is not None]
        m = np.mean(vs, axis=0)
        V[ui] = m / np.linalg.norm(m)
    return V


def knn(V):
    nb = np.zeros((len(V), K), dtype=np.int32)
    sc = np.zeros((len(V), K), dtype=np.float32)
    for s in range(0, len(V), 2048):
        S = V[s:s + 2048] @ V.T
        for r in range(S.shape[0]):
            S[r, s + r] = -1
        top = np.argpartition(-S, K, axis=1)[:, :K]
        ts = np.take_along_axis(S, top, axis=1)
        order = np.argsort(-ts, axis=1)
        nb[s:s + 2048] = np.take_along_axis(top, order, axis=1)
        sc[s:s + 2048] = np.take_along_axis(ts, order, axis=1)
        print(f"  이웃 {min(s + 2048, len(V))}/{len(V)}", end="\r", flush=True)
    print()
    return nb, sc


def main(calibrate):
    words, by_w, units, old = load_units()
    axes = [set().union(*[by_w[w]["axes"] for w in u]) for u in units]
    group = [next((old[w] for w in u if w in old), None) for u in units]
    print(f"단위(식구) {len(units)} · 기존 묶음에 든 단위 {sum(g is not None for g in group)}")
    V = unit_vectors(units, by_w)
    cache = OUT / "group-knn.npz"
    if cache.exists() and np.load(cache)["n"] == len(units):
        z = np.load(cache); nb, sc = z["nb"], z["sc"]
    else:
        nb, sc = knn(V)
        np.savez(cache, nb=nb, sc=sc, n=len(units))

    if calibrate:
        same, other = [], []
        for i in range(len(units)):
            if group[i] is None:
                continue
            for j, s in zip(nb[i], sc[i]):
                if group[j] is None:
                    continue
                (same if group[j] == group[i] else other).append(s)
        mates = Counter(g for g in group if g is not None)
        pairs = sum(n * (n - 1) for n in mates.values())
        for t in (0.70, 0.75, 0.78, 0.80, 0.82, 0.85, 0.88):
            a = sum(s >= t for s in same); b = sum(s >= t for s in other)
            print(f"  선 {t:.2f}: 같은 묶음 이웃 {a} (묶음 안 짝의 {a / max(1, pairs):.0%}) · 다른 묶음 이웃 {b} · 정밀도 {a / max(1, a + b):.0%}")
        return

    mutual = defaultdict(dict)
    for i in range(len(units)):
        for j, s in zip(nb[i], sc[i]):
            if s >= LINE and axes[i] & axes[int(j)] and i in set(nb[int(j)].tolist()):
                mutual[i][int(j)] = float(s)

    def components(nodes, line):
        seen, out = set(), []
        for n in nodes:
            if n in seen:
                continue
            stack, comp = [n], []
            seen.add(n)
            while stack:
                x = stack.pop(); comp.append(x)
                for y, s in mutual[x].items():
                    if s >= line and y in nodes and y not in seen:
                        seen.add(y); stack.append(y)
            out.append(comp)
        return out

    sets, work = [], [(c, LINE) for c in components(set(mutual), LINE)]
    while work:
        comp, line = work.pop()
        if len(comp) <= MAX_SET or line >= 0.97:
            if len(comp) > 1:
                sets.append(comp)
            continue
        work += [(c, line + 0.02) for c in components(set(comp), line + 0.02)]

    (OUT / "group-units.json").write_text(json.dumps({"units": units, "old_group": group}, ensure_ascii=False), encoding="utf-8")
    with (OUT / "group-candidates.jsonl").open("w", encoding="utf-8") as f:
        for k, comp in enumerate(sorted(sets, key=lambda c: min(units[i][0] for i in c))):
            f.write(json.dumps({"set": k + 1, "units": sorted(comp)}, ensure_ascii=False) + "\n")
    in_sets = sum(len(c) for c in sets)
    print(json.dumps({"후보 뭉치": len(sets), "뭉치에 든 단위": in_sets, "혼자인 단위": len(units) - in_sets,
                      "뭉치 크기": dict(sorted(Counter(len(c) for c in sets).items())),
                      "기존 묶음 둘 이상 든 뭉치": sum(len({group[i] for i in c if group[i] is not None}) > 1 for c in sets)},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main("--calibrate" in sys.argv)

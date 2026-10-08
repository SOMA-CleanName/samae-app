"""사진 무드 표현 뼈대 — 이웃 그래프 (docs/40 §14-6 · §14-11 · §17-5, 2026-09-23).

묶음(photo-groups.json)마다 묶음 벡터(식구 평균)로 후보 30개를 뽑고 qwen3:14b(로컬, 무료)가 읽어서 고른다 — 규칙은 §14-11 그대로
(뜻이 같거나 · 결이 비슷하거나 · 같은 장면 / 글자만 비슷 · 관계 먼 것 · 반대말은 버림). 한 줄씩 저장하고 이미 한 것은 건너뛴다.
끝나면 번들을 만든다 — 간선 상태: mutual(서로 고름) · disagreed(한쪽만 · 상대는 후보로 보고 버림) · unasked(한쪽만 · 상대 후보에 없었음) ·
floor(판정이 전부 버려 이웃 0개가 될 뻔해 유사도 상위 둘과 억지로 이음). 모두 잇는다(§14-7).

무리(photo-clusters.json)가 있으면 같은 무리의 묶음은 후보에서 뺀다 — 거의 같은 것은 이웃이 아니라 무리이고, 화면이 ≈ 로 따로 보여 준다(사람 결정 2026-09-24: 무리 뒤에 엮는다).

  py judge_photo_neighbors.py            판정(이어 하기 가능) → out/mood-vocabulary/photo-neighbor-judgments.jsonl
  py judge_photo_neighbors.py --bundle   번들만 다시 → mood-edits/photo-neighbors.json {heads, nodes, edges, judged, forced}
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

from build_photo_cluster_candidates import group_vectors, load
from judge_mood_neighbors import SYSTEM, parse

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
RESULT = OUT / "photo-neighbor-judgments.jsonl"
MODEL, CANDIDATES = "qwen3:14b", 30


def text(g, terms):
    h = g["members"][0]
    others = " · ".join(g["members"][1:6])
    usage = terms.get(h, {}).get("usage", "") or next((terms[t]["usage"] for t in g["members"] if terms.get(t, {}).get("usage")), "")
    return f"{h}" + (f" ({others})" if others else "") + (f": {usage}" if usage else "")


def ask(head_text, cand_texts):
    body = json.dumps({"model": MODEL, "think": False, "stream": False,
                       "messages": [{"role": "system", "content": SYSTEM},
                                    {"role": "user", "content": "\n".join([f"기준: {head_text}", "", "후보:"] + [f"- {t}" for t in cand_texts])}],
                       "options": {"temperature": 0, "num_predict": 300}}).encode()
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:11434/api/chat", data=body, headers={"Content-Type": "application/json"}), timeout=600) as r:
                return json.loads(r.read())["message"]["content"].strip()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))


def main():
    terms, V, idx, data = load()
    groups = data["groups"]
    heads = [g["members"][0] for g in groups]
    G = group_vectors(groups, V, idx)
    S = G @ G.T
    np.fill_diagonal(S, -9)
    try:                                                                  # 같은 무리는 후보에서 뺀다
        clusters = json.loads((EMBED / "mood-edits" / "photo-clusters.json").read_text(encoding="utf-8"))["clusters"]
    except FileNotFoundError:
        clusters = []
    mates = 0
    for c in clusters:
        ids = [heads.index(h) for h in c["members"] if h in heads]
        for i in ids:
            for j in ids:
                if i != j:
                    S[i, j] = -9
                    mates += 1
    top = np.argsort(-S, axis=1)[:, :CANDIDATES]
    print(f"묶음 {len(heads)} · 무리 {len(clusters)} (후보에서 뺀 같은 무리 짝 {mates // 2})", flush=True)

    if "--bundle" not in sys.argv:
        done = set()
        if RESULT.exists():
            done = {json.loads(l)["head"] for l in RESULT.read_text(encoding="utf-8").splitlines() if l.strip()}
        todo = [i for i, h in enumerate(heads) if h not in done]
        print(f"판정 대상 {len(todo)} / {len(heads)} (완료 {len(done)})", flush=True)
        t0 = time.time()
        with RESULT.open("a", encoding="utf-8") as fp:
            for n, i in enumerate(todo, 1):
                cands = [heads[j] for j in top[i]]
                answer = ask(text(groups[i], terms), [text(groups[j], terms) for j in top[i]])
                kept = parse(answer, cands)
                fp.write(json.dumps({"head": heads[i], "kept": kept, "dropped": [c for c in cands if c not in kept],
                                     "scores": {c: round(float(S[i, heads.index(c)]), 4) for c in kept}}, ensure_ascii=False) + "\n")
                fp.flush()
                if n % 25 == 0 or n == len(todo):
                    rate = n / (time.time() - t0)
                    print(f"  {n}/{len(todo)}  {rate:.2f}/s  남은 {(len(todo) - n) / max(rate, 1e-6) / 60:.0f}분", flush=True)

    judged = {}
    for l in RESULT.read_text(encoding="utf-8").splitlines():
        if l.strip():
            j = json.loads(l)
            judged[j["head"]] = j
    kept_by = {h: set(j["kept"]) for h, j in judged.items()}
    cand_by = {h: set(j["kept"]) | set(j["dropped"]) for h, j in judged.items()}
    edges, seen = [], set()

    def add(a, b, state):
        key = tuple(sorted((a, b)))
        if key in seen:
            return
        seen.add(key)
        edges.append({"a": key[0], "b": key[1], "state": state, "score": round(float(S[heads.index(a), heads.index(b)]), 4),
                      "photos": 0, "sameFirst": a[0] == b[0]})

    for a, ks in kept_by.items():
        for b in ks:
            if a in kept_by.get(b, set()):
                add(a, b, "mutual")
            elif a in cand_by.get(b, set()):
                add(a, b, "disagreed")
            else:
                add(a, b, "unasked")
    forced = 0
    degree = {h: 0 for h in heads}
    for e in edges:
        degree[e["a"]] += 1
        degree[e["b"]] += 1
    for i, h in enumerate(heads):
        if degree[h] == 0 and h in judged:
            for j in top[i][:2]:
                add(h, heads[j], "floor")
                forced += 1
    nodes = {h: {"senses": [terms.get(h, {}).get("usage", "")], "axes": sorted({a for t in g["members"] for a in terms.get(t, {}).get("axes", [])}),
                 "usage": terms.get(h, {}).get("usage", ""), "members": g["members"]} for h, g in zip(heads, groups)}
    bundle = {"heads": heads, "nodes": nodes, "edges": edges, "judged": len(judged), "forced": forced}
    (EMBED / "mood-edits" / "photo-neighbors.json").write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    states = {}
    for e in edges:
        states[e["state"]] = states.get(e["state"], 0) + 1
    print(f"묶음 {len(heads)} · 판정 {len(judged)} · 간선 {len(edges)} {states} · 이웃 0개 {sum(1 for h in heads if degree.get(h, 0) == 0 and h in judged) - (forced > 0 and 0)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

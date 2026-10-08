"""묶음(D2) 판정 입력 — 새 검색어마다 이웃 20 (docs/40 §17-5, 2026-09-22).

벡터는 embed_term_usage.py 의 (낱말 + 뜻풀이 + 사진 용례). 이웃은 축이 하나라도 겹치는 검색어 중 코사인 상위 20이다
(기존 검색어도 이웃으로 나온다 — 고르면 그 묶음에 든다는 뜻이고, 기존 묶음은 건드리지 않는다).
판정하는 것은 새 검색어뿐이다. 기존 검색어끼리의 묶음은 이미 사람이 정했다.

출력: out/mood-vocabulary/group-judge.jsonl — {id, term, usage, axes, definition, neighbors: [{term, usage, old, group?}]}
"""
import json
import sys
from pathlib import Path

import numpy as np

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
K = 20
AXES = ["감정", "관계", "스타일", "온도", "계절·날씨", "빛", "색감", "질감", "에너지", "공간", "시간대", "향"]


def main():
    rows = json.loads((OUT / "term-usage-index.json").read_text(encoding="utf-8"))["terms"]
    V = np.load(OUT / "term-usage-vectors.npy").astype(np.float32)
    A = np.zeros((len(rows), len(AXES)), dtype=bool)
    for i, r in enumerate(rows):
        for a in r["axes"]:
            A[i, AXES.index(a)] = True
    new = [i for i, r in enumerate(rows) if not r["old"]]
    out = []
    for s in range(0, len(new), 1024):
        idx = new[s:s + 1024]
        S = V[idx] @ V.T
        for k, i in enumerate(idx):
            S[k, i] = -9
        S[~(A[idx].astype(np.uint8) @ A.T.astype(np.uint8)).astype(bool)] = -9      # 축이 하나도 안 겹치면 뺀다
        top = np.argsort(-S, axis=1)[:, :K]
        for k, i in enumerate(idx):
            r = rows[i]
            out.append({"id": len(out) + 1, "term": r["term"], "usage": r["usage"], "axes": r["axes"],
                        "definition": r["definition"][:160],
                        "neighbors": [{"term": rows[j]["term"], "usage": rows[j]["usage"], "old": rows[j]["old"],
                                       **({"group": rows[j]["group"]} if rows[j]["old"] else {})}
                                      for j in top[k] if S[k, j] > -9]})
        print(f"  {min(s + 1024, len(new))}/{len(new)}", end="\r", flush=True)
    print()
    with (OUT / "group-judge.jsonl").open("w", encoding="utf-8") as f:
        for x in out:
            f.write(json.dumps(x, ensure_ascii=False) + "\n")
    print(len(out))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

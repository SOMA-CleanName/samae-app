"""사진 무드 표현 뼈대의 묶음(D2) 판정 입력 — 말마다 축이 겹치는 이웃 K (docs/40 §17-5, 2026-09-23).

사전 4.7만 검색어 대신 뼈대(photo-terms.jsonl, 약 1,100개) 안에서만 이웃을 찾는다. 벡터는 qwen3-embedding:8b(로컬, 무료),
문장은 "{말}: {사진 용례}" — 용례가 없는 작가 태그는 말만. 판정은 에이전트가 한다(groupjob 규칙 그대로).

  입력  out/mood-vocabulary/photo-terms.jsonl (export-photo-terms.mts)
  출력  out/mood-vocabulary/photo-judge.jsonl {id, term, usage, axes, neighbors:[{term, usage}]}
        + 스크래치 폴더(--chunks DIR)에 100줄 조각 wNNN/gNNN.jsonl
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

from build_group_candidates import embed

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
K = 10


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chunks", help="조각을 쓸 폴더(wNNN/gNNN.jsonl)")
    ap.add_argument("--size", type=int, default=100)
    args = ap.parse_args()

    rows = [json.loads(l) for l in (OUT / "photo-terms.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    texts = [f"{r['term']}: {r['usage']}" if r["usage"] else r["term"] for r in rows]
    vecs = []
    for i in range(0, len(texts), 64):
        vecs.append(embed(texts[i:i + 64]))
        print(f"  {min(i + 64, len(texts))}/{len(texts)}", end="\r", flush=True)
    print()
    V = np.concatenate(vecs).astype(np.float32)
    np.save(OUT / "photo-term-vectors.npy", V.astype(np.float16))

    axes = sorted({a for r in rows for a in r["axes"]})
    A = np.zeros((len(rows), len(axes)), dtype=np.uint8)
    for i, r in enumerate(rows):
        for a in r["axes"]:
            A[i, axes.index(a)] = 1
    S = V @ V.T
    np.fill_diagonal(S, -9)
    S[~(A @ A.T).astype(bool)] = -9                                   # 축이 하나도 안 겹치면 뺀다
    top = np.argsort(-S, axis=1)[:, :K]
    out = []
    for i, r in enumerate(rows):
        nb = [{"term": rows[j]["term"], "usage": rows[j]["usage"]} for j in top[i] if S[i, j] > -9]
        out.append({"id": i + 1, "term": r["term"], "usage": r["usage"], "axes": r["axes"], "neighbors": nb})
    with (OUT / "photo-judge.jsonl").open("w", encoding="utf-8") as f:
        for x in out:
            f.write(json.dumps(x, ensure_ascii=False) + "\n")
    print(f"{len(out)}줄 · 이웃 없는 줄 {sum(not x['neighbors'] for x in out)}")

    if args.chunks:
        base = Path(args.chunks)
        for k in range(0, len(out), args.size):
            n = k // args.size + 1
            d = base / f"w{n:03d}"
            d.mkdir(parents=True, exist_ok=True)
            with (d / f"g{n:03d}.jsonl").open("w", encoding="utf-8") as f:
                for x in out[k:k + args.size]:
                    f.write(json.dumps(x, ensure_ascii=False) + "\n")
        print(f"조각 {(len(out) + args.size - 1) // args.size}개 → {base}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

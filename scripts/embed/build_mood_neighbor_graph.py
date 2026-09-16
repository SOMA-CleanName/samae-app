"""Neighbour graph over the 2,647 representatives, for recommending related moods.

Model and input were picked by measurement, not by benchmark rank. Nine
combinations (KURE-v1 / bge-m3 / qwen3-embedding-8B × three input shapes) were run
over all 2,647 heads and scored on hub concentration, neighbour symmetry and how
often a neighbour merely shares a first syllable. Two things decided it:

  The bare word loses. 25% of its neighbours shared a first syllable — 77x chance —
  and the lists show why: 신물 → 신성·신수·신명, 노을 → 노후·노랗다·노티. The model
  was reading the spelling. Adding the definition halves that.

  The photo usage line earns its place. 신물 is 싫증, not a taste, and only the
  variant carrying "넌더리 난 표정" puts 지긋지긋하다 first; without it 신선하다 —
  the opposite — comes first.

qwen3-embedding came last on the bare word (47.2% symmetry) and first with context
(59.3%), which is the shape you would expect from a large general model: it needs
something to read. KURE, Korean-specialised, was the reverse.

Axes are not used. They are a label, not a relation (docs/36 §10-1).
"""
import json
import time
import urllib.request
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
MODEL, VARIANT, TOPK = "qwen3-embedding:8b", "c", 30


def embed(texts, batch=64):
    vectors, started = [], time.time()
    for i in range(0, len(texts), batch):
        body = json.dumps({"model": MODEL, "input": texts[i:i + batch]}).encode()
        req = urllib.request.Request("http://127.0.0.1:11434/api/embed", data=body,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=900) as r:
            vectors.extend(json.loads(r.read())["embeddings"])
        if i and i % 640 == 0:
            print(f"  {i}/{len(texts)}  {i/(time.time()-started):.0f}/s", flush=True)
    return np.asarray(vectors, dtype=np.float32)


def main():
    data = json.loads((OUT / "head-texts.json").read_text(encoding="utf-8"))
    vec = embed(data[VARIANT])
    vec /= np.linalg.norm(vec, axis=1, keepdims=True) + 1e-9
    np.save(OUT / "head-vectors.npy", vec)
    sim = vec @ vec.T
    np.fill_diagonal(sim, -1.0)
    top = np.argsort(-sim, axis=1)[:, :TOPK]
    np.save(OUT / "head-neighbors.npy", top)
    np.save(OUT / "head-neighbor-scores.npy", np.take_along_axis(sim, top, axis=1))
    print(json.dumps({"heads": len(data["heads"]), "dim": int(vec.shape[1]), "topk": TOPK},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()

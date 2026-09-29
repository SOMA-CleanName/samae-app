"""무드 판정 풀 임베딩 — qwen3-embedding:8b (docs/40 §17, 2026-09-22).

screen-pool.jsonl 의 문장("낱말: 뜻풀이")을 벡터로 바꾼다. 이웃 그래프(§14-11)와 같은 모델이다.
35만 줄이라 몇 시간 걸린다 — 2만 줄마다 조각 파일로 저장하고, 다시 돌리면 이미 만든 조각은 건너뛴다.
VRAM 을 쓰므로 SigLIP 컨테이너는 내려 둔다.

  PY=/c/Users/GINA/AppData/Local/Programs/Python/Python314/python.exe   # numpy 가 있는 파이썬
  $PY -u embed_screen_pool.py

결과: out/mood-vocabulary/screen-vectors/part-0000.npy … (float16, 정규화), 줄 순서는 screen-pool.jsonl 과 같다.
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
POOL = OUT / "screen-pool.jsonl"
PARTS = OUT / "screen-vectors"
MODEL, BATCH, PART = "qwen3-embedding:8b", 64, 20000


def embed(texts):
    body = json.dumps({"model": MODEL, "input": texts}).encode()
    for attempt in range(5):
        try:
            req = urllib.request.Request("http://127.0.0.1:11434/api/embed", data=body,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=900) as r:
                return json.loads(r.read())["embeddings"]
        except Exception:
            if attempt == 4:
                raise
            time.sleep(5 * (attempt + 1))


def main():
    texts = [json.loads(l)["text"] for l in POOL.read_text(encoding="utf-8").splitlines() if l.strip()]
    PARTS.mkdir(parents=True, exist_ok=True)
    parts = (len(texts) + PART - 1) // PART
    started, done = time.time(), 0
    for p in range(parts):
        path = PARTS / f"part-{p:04d}.npy"
        chunk = texts[p * PART:(p + 1) * PART]
        if path.exists():
            continue
        vectors = []
        for i in range(0, len(chunk), BATCH):
            vectors.extend(embed(chunk[i:i + BATCH]))
        v = np.asarray(vectors, dtype=np.float32)
        v /= np.linalg.norm(v, axis=1, keepdims=True) + 1e-9
        np.save(path, v.astype(np.float16))
        done += len(chunk)
        rate = done / (time.time() - started)
        left = sum(len(texts[q * PART:(q + 1) * PART]) for q in range(p + 1, parts)
                   if not (PARTS / f"part-{q:04d}.npy").exists())
        print(f"  조각 {p + 1}/{parts}  {rate:.1f}/s  남은 {left / rate / 60:.0f}분", flush=True)
    print("완료", len(texts), flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

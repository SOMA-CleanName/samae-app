"""English mood prompts -> SigLIP2 vectors, cached on disk.

Clustering runs many times while thresholds are tuned; the embedding does not
change between runs, so it is done once and reused. The server takes 8 texts a
call, so identical prompts are sent once and shared afterwards.
"""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
URL = "http://127.0.0.1:8077/embed-text-backfill"
BATCH = 8


def post(texts, retries=3):
    body = json.dumps({"texts": texts}).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(URL, data=body,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as r:
                payload = json.loads(r.read())
            return payload.get("vectors") or payload["embeddings"]
        except (urllib.error.URLError, TimeoutError, KeyError):
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def embed(prompts, progress=True):
    # Same prompt, same vector — 5,176 words share ~3,600 prompts, so this is a third off.
    uniq = sorted(set(prompts))
    vectors, started = {}, time.time()
    for i in range(0, len(uniq), BATCH):
        chunk = uniq[i:i + BATCH]
        vectors.update(zip(chunk, post(chunk)))
        if progress and (i // BATCH) % 50 == 0 and i:
            rate = i / (time.time() - started)
            print(f"  {i}/{len(uniq)}  {rate:.0f}/s  남은 {(len(uniq)-i)/rate/60:.0f}분", flush=True)
    return vectors


def main():
    rows = [l.split("\t") for l in
            (OUT / "mood-prompts.tsv").read_text(encoding="utf-8").splitlines() if l.strip()]
    prompts = [r[2] for r in rows]
    print(f"낱말 {len(rows)}개 / 서로 다른 프롬프트 {len(set(prompts))}개", flush=True)
    vectors = embed(prompts)
    (OUT / "mood-vectors.json").write_text(
        json.dumps({"model": "siglip2-so400m-patch16-naflex", "dim": len(next(iter(vectors.values()))),
                    "vectors": vectors}, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"prompts": len(vectors), "file": "mood-vectors.json"}, ensure_ascii=False))


if __name__ == "__main__":
    main()

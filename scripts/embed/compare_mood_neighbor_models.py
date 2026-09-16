"""Embed the 2,647 representatives with several models and compare the neighbours.

Not a pair test. §9-1 compared hand-picked pairs, which works when the question is
"does this model read Korean at all". Here the question is "whose neighbour list is
usable", and the failure we actually hit in the photo direction — a handful of heads
turning up as everyone's neighbour — is invisible to a pair test. So this builds the
real output for every head and measures the two things that exposed it:

  hub concentration  how much of the top-10 neighbour slots a few heads take
  symmetry           if B is A's neighbour, is A also B's

Axes are deliberately not used. They are a label, not a relation (docs/36 §10-1).
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
OLLAMA = "http://127.0.0.1:11434/api/embed"
TOPK = 10
PROBES = ["씁쓰레", "서운하다", "신물", "깜박이다", "외롭다", "따듯하다", "고즈넉이", "노을"]


def embed_ollama(model, texts, batch=64):
    vectors = []
    for i in range(0, len(texts), batch):
        body = json.dumps({"model": model, "input": texts[i:i + batch]}).encode()
        req = urllib.request.Request(OLLAMA, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=900) as r:
            vectors.extend(json.loads(r.read())["embeddings"])
    return np.asarray(vectors, dtype=np.float32)


def embed_hf(repo, texts, batch=32):
    import torch
    from transformers import AutoModel, AutoTokenizer
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    tok = AutoTokenizer.from_pretrained(repo)
    model = AutoModel.from_pretrained(repo).to(device).eval()
    out = []
    for i in range(0, len(texts), batch):
        enc = tok(texts[i:i + batch], padding=True, truncation=True, max_length=256, return_tensors="pt").to(device)
        with torch.no_grad():
            # bge-m3 계열은 CLS 풀링이 표준이다. 평균 풀링을 쓰면 점수가 달라진다.
            hidden = model(**enc).last_hidden_state[:, 0]
        out.append(torch.nn.functional.normalize(hidden, dim=-1).cpu().numpy())
    del model
    return np.concatenate(out).astype(np.float32)


def neighbours(vectors):
    V = vectors / (np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-9)
    S = V @ V.T
    np.fill_diagonal(S, -1.0)
    return S, np.argsort(-S, axis=1)[:, :TOPK]


def measure(top):
    n = top.shape[0]
    counts = np.bincount(top.ravel(), minlength=n)
    hub = counts[np.argsort(-counts)[:10]].sum() / (TOPK * n)
    sets = [set(row) for row in top]
    mutual = sum(1 for i, row in enumerate(top) for j in row if i in sets[j])
    return hub, mutual / (TOPK * n), (counts == 0).sum(), np.argsort(-counts)[:5]


def main():
    data = json.loads((OUT / "head-texts.json").read_text(encoding="utf-8"))
    heads = data["heads"]
    index = {h: i for i, h in enumerate(heads)}
    runs = [("KURE-v1", "hf", "nlpai-lab/KURE-v1"),
            ("bge-m3", "hf", "BAAI/bge-m3"),
            ("qwen3-emb-8B", "ollama", "qwen3-embedding:8b")]
    report = {}
    for label, kind, ref in runs:
        for variant in ("a", "b", "c"):
            key = f"{label} ({variant})"
            started = time.time()
            vec = embed_hf(ref, data[variant]) if kind == "hf" else embed_ollama(ref, data[variant])
            S, top = neighbours(vec)
            hub, sym, orphan, worst = measure(top)
            report[key] = {
                "seconds": round(time.time() - started, 1),
                "hub_share": round(float(hub), 4),
                "symmetry": round(float(sym), 4),
                "never_a_neighbour": int(orphan),
                "top_hubs": [heads[i] for i in worst],
                "probes": {p: [heads[j] for j in top[index[p]]] for p in PROBES if p in index},
            }
            np.save(OUT / f"neigh-{label}-{variant}.npy", top)
            print(f"  {key:<22} {report[key]['seconds']:>6.1f}s  허브 {hub*100:>5.1f}%  대칭 {sym*100:>5.1f}%  고아 {orphan:,}", flush=True)
    (OUT / "neighbor-model-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n저장: out/mood-vocabulary/neighbor-model-report.json")


if __name__ == "__main__":
    main()

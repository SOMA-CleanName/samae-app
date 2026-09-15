"""Mood words -> a layered synonym graph, from the cached prompt vectors.

One threshold gives one layer: a high cosine groups near-identical wordings
(흠칫 / 흠칫하다), a lower one merges those groups into the family a person would
actually search for (놀람). Recording a snapshot at each threshold on the way down
is what makes the result a graph rather than a flat list.

Average linkage, not single linkage — one stray member must not chain two
unrelated families together.

Runs inside the SigLIP container (numpy, read-only mount), so it prints JSON to
stdout instead of writing a file.
"""
import json
import sys
from pathlib import Path

import numpy as np

OUT = Path(sys.argv[1] if len(sys.argv) > 1
           else "/app/embed/out/mood-vocabulary")
LAYERS = (0.94, 0.91, 0.88, 0.82)


def load(out=OUT):
    rows = [l.split("\t") for l in
            (out / "mood-prompts.tsv").read_text(encoding="utf-8").splitlines() if l.strip()]
    vectors = json.loads((out / "mood-vectors.json").read_text(encoding="utf-8"))["vectors"]
    by_prompt = {}
    for _, label, prompt in rows:
        by_prompt.setdefault(prompt, []).append(label)
    return rows, by_prompt, vectors


def layered(keys, vectors, layers=LAYERS):
    """Merge greedily and snapshot each time the best pair drops below a threshold."""
    matrix = np.array([vectors[k] for k in keys], dtype=np.float32)
    matrix /= np.linalg.norm(matrix, axis=1, keepdims=True)
    sim = matrix @ matrix.T
    np.fill_diagonal(sim, -np.inf)

    members = [[i] for i in range(len(keys))]
    alive = np.ones(len(keys), dtype=bool)
    size = np.ones(len(keys), dtype=np.float32)
    snapshots, pending = {}, sorted(layers, reverse=True)

    while pending:
        best = sim.max()
        while pending and best < pending[0]:
            snapshots[pending.pop(0)] = [list(m) for m in members if m]
        if not pending:
            break
        i, j = np.unravel_index(np.argmax(sim), sim.shape)
        i, j = (int(i), int(j)) if size[i] >= size[j] else (int(j), int(i))
        # Lance-Williams for average linkage: the merged row is the size-weighted mean.
        sim[i, :] = (size[i] * sim[i, :] + size[j] * sim[j, :]) / (size[i] + size[j])
        sim[:, i] = sim[i, :]
        sim[i, i] = -np.inf
        sim[j, :] = -np.inf
        sim[:, j] = -np.inf
        members[i] += members[j]
        members[j] = []
        size[i] += size[j]
        alive[j] = False
    for t in pending:
        snapshots[t] = [list(m) for m in members if m]
    return snapshots


def build(out=OUT, layers=LAYERS):
    rows, by_prompt, vectors = load(out)
    keys = sorted(by_prompt)
    snapshots = layered(keys, vectors, layers)
    result = {}
    for threshold, groups in snapshots.items():
        result[str(threshold)] = [
            {"prompts": [keys[i] for i in g],
             "words": sorted(w for i in g for w in by_prompt[keys[i]])}
            for g in sorted(groups, key=len, reverse=True)]
    return {"words": len(rows), "prompts": len(keys), "layers": result}


if __name__ == "__main__":
    json.dump(build(), sys.stdout, ensure_ascii=False)

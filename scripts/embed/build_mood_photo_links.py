"""Attach representatives to photos with SigLIP2, then read moods off the overlap.

Why SigLIP and not a Korean model: the photos are already embedded with
siglip2-so400m-patch16-naflex, and text→image is what this model is for. §9-1's
finding — that it cannot read Korean — is about text↔text, which is not this step.

Two things had to be fixed before the output was usable.

Hubness. Raw cosine puts the same few heads at the top of every photo: 첫사랑,
현장감, 서민적 took 32% of the top-10 slots and 1,807 of 2,647 heads never
appeared at all. Normalising both ways (per head, then per photo) drops that to
single digits and evens out how many moods a photo gets — the coefficient of
variation goes 3.43 → 0.55.

The built-in threshold. SigLIP is trained with a sigmoid loss, so
p = sigmoid(113.73·cos − 15.94) is an absolute yes/no per pair, which is exactly
what we want: a photo takes as many moods as fit, not a fixed K. But that
calibration is learned on web alt-text, and our prompts are terse mood phrases —
the whole 2,647 × 1,780 matrix tops out at cos 0.1418, barely over the p=0.5 line
at 0.1402. So the cut is made on our own numbers instead: a normalised score above
Z **and** a raw cosine above COS, the second condition being what stops a head with
no real match from attaching anywhere.

Caveat worth keeping in view: a head with no photos is not a rare word, it is a
scene our 1,780 photos do not contain — 외롭다, 분노, 화나다 all come up empty
because the collection leans wedding/couple/profile.
"""
import json
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
Z, COS = 2.5, 0.06


def zscore(M, axis):
    return (M - M.mean(axis=axis, keepdims=True)) / (M.std(axis=axis, keepdims=True) + 1e-9)


def link(sim, z=Z, cos=COS):
    """대표 방향으로 한 번, 사진 방향으로 한 번. 한쪽만 하면 한쪽 편차가 그대로 남는다."""
    dual = zscore(zscore(sim, 1), 0)
    return (dual >= z) & (sim >= cos), dual


def cooccurrence(mask):
    """같은 사진에 함께 붙은 횟수. 사진이 많은 대표가 과대평가되지 않게 정규화한다."""
    M = mask.astype(np.float32)
    counts = M.sum(axis=1)
    sim = (M @ M.T) / (np.sqrt(np.outer(counts, counts)) + 1e-9)
    np.fill_diagonal(sim, 0.0)
    return sim, counts


def main():
    sim = np.load(OUT / "head-photo-sim.npy")
    heads = json.loads((OUT / "head-order.json").read_text(encoding="utf-8"))
    mask, dual = link(sim)
    co, counts = cooccurrence(mask)
    np.save(OUT / "head-photo-mask.npy", mask)
    np.save(OUT / "head-cooccurrence.npy", co)
    print(json.dumps({"pairs": int(mask.sum()), "heads_with_photos": int((counts > 0).sum()),
                      "heads_without": int((counts == 0).sum()),
                      "photos_per_head_median": float(np.median(counts)),
                      "moods_per_photo_median": float(np.median(mask.sum(axis=0)))},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()

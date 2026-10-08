"""무드 판정 풀 점수 매기기 — kNN (docs/40 §17, 2026-09-23).

이미 판정한 정답 표본(무드 / 아님)과 뜻풀이 임베딩이 가장 가까운 25개를 찾아, 그 판정을 유사도로 가중 평균한다.
선을 긋는 분류기(로지스틱 회귀) 대신 이걸 쓴 이유: 학습이 필요 없어 바로 되고, **왜 그 점수인지 이웃으로 보여 줄 수 있다**.
정답 표본 5겹 교차 검증에서 AUC 0.93 (표본은 무드 쪽으로 좁혀 둔 것이라 전체보다 어렵다).

정답 표본만 쓰면 전문 명사(수광 · 거미그물)가 "빛" 같은 무드 표본 옆에 붙어 높은 점수를 받았다 — 표본이 무드 쪽으로
좁혀 둔 것이라 "명백히 아닌" 예시가 없어서다. 그래서 **기초사전 의미 범주로 무드가 아님이 확실한 낱말**을 "아님" 표본으로
더한다: 수식어(형용사·관형사·부사)가 아니고, 의미 범주가 붙어 있는데 그게 무드 범주(색깔 · 감정 · 기상 …, §0)가 아닌 것.

점수는 "어떤 것부터 볼지" 의 순서일 뿐이다. 무드인지는 판정이 정한다.
표본 자신은 자기를 이웃으로 쓰지 않는다(교차 검증과 같은 조건).

입력: screen-pool.jsonl, screen-vectors/part-*.npy (embed_screen_pool.py)
출력: out/mood-vocabulary/screen-scores.jsonl — {word, score, near: [가까운 표본 3개(판정)]}
"""
import json
import sys
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
K, SHARP, BATCH = 25, 20.0, 4000
MODIFIERS = {"형용사", "관형사", "부사"}
MOOD_CATEGORIES = {
    "개념 > 색깔", "개념 > 밝기", "개념 > 온도", "개념 > 속도", "개념 > 시간",
    "개념 > 모양", "개념 > 성질", "자연 > 기상 및 기후", "자연 > 자연물", "자연 > 지형",
    "인간 > 감정", "인간 > 감각", "인간 > 태도", "인간 > 성격", "인간 > 용모",
    "사회 생활 > 인간관계", "주생활 > 주거 상태",
}   # build_mood_priority_pool.py 의 CATEGORIES 와 같다


def rule_negatives():
    """기초사전 의미 범주로 무드가 아님이 확실한 낱말."""
    parts, cats = {}, {}
    for entries in json.loads((OUT / "senses.json").read_text(encoding="utf-8"))["entries"].values():
        for e in entries:
            w = " ".join(e["label"].split())
            parts.setdefault(w, set()).add(e["metadata"].get("partOfSpeech"))
            cats.setdefault(w, set()).add(e["metadata"].get("semanticCategory"))
    return {w for w in parts
            if not (parts[w] & MODIFIERS) and (cats[w] - {None}) and not (cats[w] & MOOD_CATEGORIES)}


def main():
    rows = [json.loads(l) for l in (OUT / "screen-pool.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    X = np.concatenate([np.load(p) for p in sorted((OUT / "screen-vectors").glob("part-*.npy"))]).astype(np.float32)
    assert len(X) == len(rows), (len(X), len(rows))
    negatives = rule_negatives()
    label = {}
    for i, r in enumerate(rows):
        if "judged" in r:
            label[i] = 1.0 if r["judged"] == "mood" else 0.0
        elif r["word"] in negatives:
            label[i] = 0.0                              # 의미 범주로 확실히 아님
    lab = np.array(sorted(label))
    L = X[lab]
    y = np.array([label[i] for i in lab], dtype=np.float32)
    print(f"표본: 판정 {sum(1 for r in rows if 'judged' in r):,} + 범주로 확실히 아님 {len(lab) - sum(1 for r in rows if 'judged' in r):,}", flush=True)
    names = [rows[i]["word"] for i in lab]
    pos_of = {int(i): j for j, i in enumerate(lab)}
    with (OUT / "screen-scores.jsonl").open("w", encoding="utf-8") as f:
        for start in range(0, len(X), BATCH):
            S = X[start:start + BATCH] @ L.T
            for r in range(S.shape[0]):                     # 표본 자신은 이웃에서 뺀다
                j = pos_of.get(start + r)
                if j is not None:
                    S[r, j] = -1.0
            nn = np.argpartition(-S, K, axis=1)[:, :K]
            sims = np.take_along_axis(S, nn, axis=1)
            w = np.exp((sims - sims.max(axis=1, keepdims=True)) * SHARP)
            score = (w * y[nn]).sum(1) / w.sum(1)
            for r in range(S.shape[0]):
                top = nn[r][np.argsort(-sims[r])][:3]
                row = rows[start + r]
                out = {"word": row["word"], "score": round(float(score[r]), 4),
                       "near": [f"{names[t]}({'무드' if y[t] else '아님'})" for t in top]}
                if "judged" in row:
                    out["judged"] = row["judged"]
                f.write(json.dumps(out, ensure_ascii=False) + "\n")
            print(f"  {min(start + BATCH, len(X)):,}/{len(X):,}", flush=True)
    print("완료", flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

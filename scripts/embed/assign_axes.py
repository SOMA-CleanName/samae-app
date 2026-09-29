"""1차 전처리 무드에 축 후보 붙이기 — 분류기 (docs/40 §17-4, 2026-09-23).

정답: 검색어 번들(mood-terms-bundle.json)에서 축이 붙은 묶음 — 2026-09-16 대표 2,647개를 Claude 가 뜻풀이를 읽고
붙였고(§10), 2차 검토로 고친 것. 묶음의 대표 · 검색어 · 별칭 낱말이 모두 그 축을 정답으로 갖는다.
입력: 뜻풀이 임베딩(qwen3-embedding:8b, screen-vectors/ — 1차 전처리 때 만든 것). 판정 풀 밖에서 추가한 말은
      mood-edits/glosses-added.jsonl 의 설명(없으면 용례)으로 새로 임베딩한다.
모델: 축 11개마다 따로 로지스틱 회귀(다축). 정확도는 **묶음 단위로 갈라** 5겹 교차 검증 — 같은 묶음 식구가
      학습과 시험에 갈려 들어가면 점수가 부풀기 때문이다. 축마다 교차 검증 F1 이 가장 높은 점수를 경계로 쓴다.
판정: 경계를 넘은 축을 모두 붙이고, 하나도 없으면 가장 높은 축 하나. 경계 근처(가장 높은 점수가 애매한 구간)이거나
      정답과 교차 검증이 어긋난 것은 애매로 남겨 에이전트가 뜻풀이를 읽고 정한다.

출력: out/mood-vocabulary/axis-scores.jsonl — {w, scores{축: 점수}, axes, sure, labeled?}
     out/mood-vocabulary/axis-report.json — 축별 정밀도 · 재현율 · 경계, 붙은 축 수 분포
"""
import json
import sys
import urllib.request
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
AXES = ["감정", "관계", "스타일", "온도", "계절·날씨", "빛", "색감", "질감", "에너지", "공간", "시간대"]
UNSURE_BAND = 0.15          # 가장 높은 점수가 경계에서 이만큼 안쪽이면 애매


def embed(texts):
    vectors = []
    for s in range(0, len(texts), 32):
        body = json.dumps({"model": "qwen3-embedding:8b", "input": texts[s:s + 32]}).encode()
        req = urllib.request.Request("http://127.0.0.1:11434/api/embed", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=900) as r:
            v = np.asarray(json.loads(r.read())["embeddings"], dtype=np.float32)
        vectors.append(v / np.linalg.norm(v, axis=1, keepdims=True))
    return np.concatenate(vectors) if vectors else np.zeros((0, 4096), np.float32)


def main():
    words = json.loads((EMBED / "mood-screen-list.json").read_text(encoding="utf-8"))["words"]
    pool = [json.loads(l) for l in (OUT / "screen-pool.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    at = {r["word"]: i for i, r in enumerate(pool)}
    X_pool = np.concatenate([np.load(p) for p in sorted((OUT / "screen-vectors").glob("part-*.npy"))])
    assert len(X_pool) == len(pool)

    glosses = {}
    for line in (EMBED / "mood-edits" / "glosses-added.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            g = json.loads(line)
            glosses[g["word"]] = g["gloss"]
    outside = [w for w in words if w["w"] not in at]
    texts = [f"{w['w']}: {glosses.get(w['w']) or w['why']}" for w in outside]
    X_out = embed(texts) if outside else np.zeros((0, X_pool.shape[1]), np.float32)
    vec = {w["w"]: X_out[i] for i, w in enumerate(outside)}

    X = np.stack([X_pool[at[w["w"]]].astype(np.float32) if w["w"] in at else vec[w["w"]] for w in words])

    # 정답 — 묶음마다 축, 묶음 번호는 교차 검증을 묶음 단위로 가르는 데 쓴다
    label, group = {}, {}
    for gi, row in enumerate(json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))["rows"]):
        if row.get("added") or not row["axes"]:
            continue
        for w in [row["head"], *row["terms"], *row["aliases"]]:
            label.setdefault(w, set(row["axes"]))
            group.setdefault(w, gi)
    idx = np.array([i for i, w in enumerate(words) if w["w"] in label])
    Y = np.array([[a in label[words[i]["w"]] for a in AXES] for i in idx], dtype=int)
    groups = np.array([group[words[i]["w"]] for i in idx])
    print(f"낱말 {len(words):,} · 정답 {len(idx):,}(묶음 {len(set(groups)):,}) · 새로 임베딩 {len(outside)}", flush=True)

    oof = np.zeros(Y.shape)
    for tr, te in GroupKFold(5).split(idx, groups=groups):
        for k in range(len(AXES)):
            m = LogisticRegression(C=2.0, max_iter=3000, class_weight="balanced").fit(X[idx[tr]], Y[tr, k])
            oof[te, k] = m.predict_proba(X[idx[te]])[:, 1]

    report, thresholds = {}, []
    for k, axis in enumerate(AXES):
        best = (0, 0.5, 0, 0)
        for t in np.linspace(0.2, 0.95, 76):
            pred = oof[:, k] >= t
            tp = int((pred & (Y[:, k] == 1)).sum())
            p = tp / max(1, pred.sum())
            r = tp / max(1, Y[:, k].sum())
            f = 2 * p * r / max(1e-9, p + r)
            if f > best[0]:
                best = (f, float(t), p, r)
        thresholds.append(best[1])
        report[axis] = {"정답 낱말": int(Y[:, k].sum()), "경계": round(best[1], 2),
                        "정밀도": round(best[2], 3), "재현율": round(best[3], 3), "F1": round(best[0], 3)}
    th = np.array(thresholds)

    def decide(p):
        axes = [AXES[k] for k in range(len(AXES)) if p[k] >= th[k]]
        top = int(np.argmax(p - th))
        if not axes:
            axes = [AXES[top]]
        sure = bool((p[top] - th[top]) >= UNSURE_BAND or p[top] >= 0.9)
        return axes, sure

    # 정답 낱말의 교차 검증 결과로 "얼마나 맞히나" 를 잰다
    exact = sum(set(decide(oof[j])[0]) == label[words[i]["w"]] for j, i in enumerate(idx))
    overlap = sum(bool(set(decide(oof[j])[0]) & label[words[i]["w"]]) for j, i in enumerate(idx))

    models = [LogisticRegression(C=2.0, max_iter=3000, class_weight="balanced").fit(X[idx], Y[:, k]) for k in range(len(AXES))]
    P = np.stack([m.predict_proba(X)[:, 1] for m in models], axis=1)
    rows, counts, sure_n = [], Counter(), 0
    labeled_set = set(idx.tolist())
    for i, w in enumerate(words):
        axes, sure = decide(P[i])
        if i in labeled_set:
            axes, sure = sorted(label[w["w"]], key=AXES.index), True     # 정답이 있는 낱말은 정답 그대로
        rows.append({"w": w["w"], "scores": {a: round(float(P[i, k]), 3) for k, a in enumerate(AXES)},
                     "axes": axes, "sure": sure, **({"labeled": True} if i in labeled_set else {})})
        counts[len(axes)] += 1
        sure_n += sure
    (OUT / "axis-scores.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    per_axis = Counter(a for r in rows for a in r["axes"])
    summary = {"축별": report, "교차 검증 — 축 세트가 정답과 같음": round(exact / len(idx), 3),
               "교차 검증 — 정답 축을 하나라도 맞힘": round(overlap / len(idx), 3),
               "낱말": len(rows), "정답 있는 낱말": len(idx), "확신": sure_n, "애매": len(rows) - sure_n,
               "붙은 축 수": dict(sorted(counts.items())), "축별 낱말": {a: per_axis[a] for a in AXES}}
    (OUT / "axis-report.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

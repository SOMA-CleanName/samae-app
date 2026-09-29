"""무드 판정 풀 줄 세우기 + 1차 자르기 (docs/40 §17, 2026-09-23).

35만 개를 하나씩 판정할 수 없어 "무드일 가능성" 으로 줄 세운 뒤, 정답 표본의 무드를 99% 살리는 선에서 자른다.
점수는 순서일 뿐 — 무드인지는 뒤의 판정이 정한다.

방법은 정답 표본(이미 판정한 11,086개)으로 재서 골랐다. "무드 99% 를 살리면 아직 판정 안 한 것 중 몇 개를 봐야 하나":

  kNN(가까운 표본 25개)               192,408   AUC 0.923  — 옛 판정(개성적·꾸밈 = 아님)을 그대로 따라가 신조어가 가운데로 밀림
  축 설명문과의 유사도                  182,502   AUC 0.680
  로지스틱 회귀(임베딩)                 136,265   AUC 0.885
  **아래 신호를 모두 합친 것**           118,633   AUC 0.915  — 이것을 쓴다 (95% 선이면 60,094)
  qwen3:14b 직접 판정(500개 시험)       정밀도 56.9% · 재현율 92.1% — 너무 너그러워 판정도 거르기도 못 맡긴다

합친 신호: 임베딩 로지스틱 회귀 점수 · kNN 점수 · 11축(+모양) 설명문과의 유사도 · 품사(형용사·부사·동사·명사·구) ·
외래어·혼종어 · 분야(영상·미술·복식 …) · 분야 없음 · 출처(사진 표현 목록 · 검증 후보 · 기초사전) · 첩어 ·
-스럽다·-롭다 / -하다·-히 / -적 꼴 · 띄어쓰기 · 뜻풀이 길이.
"아님" 표본에는 기초사전 의미 범주로 확실히 아닌 28,763개를 더한다(score_screen_pool.rule_negatives).

입력: screen-pool.jsonl · screen-vectors/ · screen-scores.jsonl(kNN) · opendict-pool.jsonl · senses.json
출력: screen-ranked.jsonl(전체, 점수순) · screen-candidates.jsonl(판정할 것)
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold

from score_screen_pool import rule_negatives

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
RECALL = 0.99
PROTOS = [
    "감정: 기쁨 · 슬픔 · 설렘 · 외로움처럼 사람의 마음과 기분을 나타내는 말",
    "관계: 연인 · 가족 · 친구 사이의 다정함, 거리감, 애틋함을 나타내는 말",
    "스타일: 옷차림 · 꾸밈 · 분위기의 멋이나 개성, 세련됨, 빈티지나 모던함을 나타내는 말",
    "온도: 따뜻하거나 차갑거나 서늘한 느낌을 나타내는 말",
    "계절·날씨: 봄 · 여름 · 가을 · 겨울, 비 · 눈 · 안개 · 바람 같은 날씨와 계절감을 나타내는 말",
    "빛: 햇살 · 노을 · 역광 · 반짝임처럼 빛이 비치거나 밝고 어두운 모양을 나타내는 말",
    "색감: 색깔 · 색조 · 톤, 파스텔이나 선명함 같은 색의 느낌을 나타내는 말",
    "질감: 부드럽거나 거칠거나 매끄럽거나 보송한 겉면의 느낌을 나타내는 말",
    "에너지: 활기차거나 고요하거나 역동적이거나 느긋한 움직임과 기운을 나타내는 말",
    "공간: 탁 트이거나 좁거나 아늑하거나 외진 장소의 느낌을 나타내는 말",
    "시간대: 새벽 · 아침 · 한낮 · 해 질 녘 · 밤처럼 하루의 때를 나타내는 말",
    "모양: 사람이나 사물의 생김새, 움직이는 모양이나 소리를 흉내 내는 말",
]
SCENE_CATS = {"영상", "미술", "복식", "공예", "식물", "천문", "지구", "지리", "자연 일반", "해양", "심리", "민속",
              "무용", "연기", "음악", "문학", "매체"}
REDUP = re.compile(r"^(.{2,3})\1")


def embed(texts):
    body = json.dumps({"model": "qwen3-embedding:8b", "input": texts}).encode()
    req = urllib.request.Request("http://127.0.0.1:11434/api/embed", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        v = np.asarray(json.loads(r.read())["embeddings"], dtype=np.float32)
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def flags(rows):
    opendict = {}
    for line in (OUT / "opendict-pool.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            e = json.loads(line)
            opendict[e["word"]] = e
    krpos = {}
    for entries in json.loads((OUT / "senses.json").read_text(encoding="utf-8"))["entries"].values():
        for e in entries:
            krpos.setdefault(" ".join(e["label"].split()), set()).add(e["metadata"].get("partOfSpeech"))
    out = []
    for r in rows:
        w = r["word"]
        e = opendict.get(w, {})
        poss = {s["pos"] for s in e.get("senses", [])} | krpos.get(w, set())
        cats = {c for s in e.get("senses", []) for c in s["cats"]}
        out.append([
            "형용사" in poss, "부사" in poss, "동사" in poss, "명사" in poss, bool(set(e.get("units", [])) - {"어휘"}),
            bool({"외래어", "혼종어"} & set(e.get("word_types", []))), bool(cats & SCENE_CATS), bool(e) and not cats,
            "generated" in r["sources"], "editorial" in r["sources"], "krdict" in r["sources"], bool(REDUP.match(w)),
            w.endswith(("스럽다", "롭다", "스레", "스러운", "로운")), w.endswith(("하다", "히", "한")),
            w.endswith(("적", "적인")), " " in w, len(r["text"]) / 300,
        ])
    return np.array(out, dtype=np.float32)


def main():
    rows = [json.loads(l) for l in (OUT / "screen-pool.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    X = np.concatenate([np.load(p) for p in sorted((OUT / "screen-vectors").glob("part-*.npy"))])
    N = len(rows)
    knn = np.array([json.loads(l)["score"] for l in (OUT / "screen-scores.jsonl").read_text(encoding="utf-8").splitlines()])
    assert len(knn) == N
    gold = np.array([i for i, r in enumerate(rows) if "judged" in r])
    y = np.array([rows[i]["judged"] == "mood" for i in gold], dtype=int)
    negs = rule_negatives()
    rneg = np.array([i for i, r in enumerate(rows) if "judged" not in r and r["word"] in negs])
    f32 = lambda idx: X[idx].astype(np.float32)
    chunks = lambda fn: np.concatenate([fn(np.arange(s, min(s + 20000, N))) for s in range(0, N, 20000)])

    # 1) 임베딩 로지스틱 회귀 — 교차 검증 점수(정답 표본) + 전체 점수
    Xg, Xn = f32(gold), f32(rneg)
    lr = lambda: LogisticRegression(C=4.0, max_iter=3000, class_weight="balanced")
    skf = StratifiedKFold(5, shuffle=True, random_state=7)
    oof_a = np.zeros(len(gold))
    for tr, te in skf.split(Xg, y):
        m = lr().fit(np.vstack([Xg[tr], Xn]), np.concatenate([y[tr], np.zeros(len(Xn), int)]))
        oof_a[te] = m.predict_proba(Xg[te])[:, 1]
    m = lr().fit(np.vstack([Xg, Xn]), np.concatenate([y, np.zeros(len(Xn), int)]))
    full_a = chunks(lambda idx: m.predict_proba(f32(idx))[:, 1])

    # 2) 축 설명문 유사도, 3) 품사·어종·분야·출처
    P = embed(PROTOS)
    sim = chunks(lambda idx: f32(idx) @ P.T)
    F = flags(rows)
    stack = lambda a, idx: np.hstack([a[:, None], knn[idx][:, None], sim[idx], F[idx]])

    # 4) 합치기 — 교차 검증으로 선을 정하고, 전체는 모든 표본으로 학습한 것으로 매긴다
    oof = np.zeros(len(gold))
    for tr, te in skf.split(Xg, y):
        c = LogisticRegression(max_iter=3000, class_weight="balanced").fit(
            np.vstack([stack(oof_a[tr], gold[tr]), stack(full_a[rneg], rneg)]), np.concatenate([y[tr], np.zeros(len(rneg), int)]))
        oof[te] = c.predict_proba(stack(oof_a[te], gold[te]))[:, 1]
    c = LogisticRegression(max_iter=3000, class_weight="balanced").fit(
        np.vstack([stack(oof_a, gold), stack(full_a[rneg], rneg)]), np.concatenate([y, np.zeros(len(rneg), int)]))
    score = c.predict_proba(stack(full_a, np.arange(N)))[:, 1]
    th = float(np.sort(oof[y == 1])[int((1 - RECALL) * y.sum())])

    labeled = set(gold.tolist()) | set(rneg.tolist())
    gold_set = set(gold.tolist())
    order = np.argsort(-score)
    kept = 0
    with (OUT / "screen-ranked.jsonl").open("w", encoding="utf-8") as ranked, \
         (OUT / "screen-candidates.jsonl").open("w", encoding="utf-8") as cand:
        for i in order:
            r = rows[i]
            row = {"word": r["word"], "score": round(float(score[i]), 4), "knn": round(float(knn[i]), 4),
                   "text": r["text"], "sources": r["sources"]}
            if "judged" in r:
                row["judged"] = r["judged"]
            elif i in labeled:
                row["judged"] = "not_mood(category)"
            ranked.write(json.dumps(row, ensure_ascii=False) + "\n")
            known_photo = bool({"generated", "editorial"} & set(r["sources"]))   # 사진 쪽 표현은 점수와 관계없이
            # 뜻풀이가 없으면(존예 · 존잘 · 마스터피스) 분류기가 읽을 것이 없어 점수를 믿을 수 없다 — 점수와 관계없이 판정한다
            known_photo = known_photo or ":" not in r["text"]
            # 범주로 '확실히 아님' 도 점수가 선 위면 판정한다 — 역광처럼 범주가 틀린 것이 섞여 있다(무드를 최대한 살린다)
            if i not in gold_set and (score[i] >= th or known_photo):
                cand.write(json.dumps(row, ensure_ascii=False) + "\n")
                kept += 1
    print(json.dumps({"정답 표본 AUC": round(roc_auc_score(y, oof), 3), "무드 99% 선": round(th, 4),
                      "판정할 것": kept, "전체": N}, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

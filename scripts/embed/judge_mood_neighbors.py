"""Have a local LLM prune the neighbour candidates. Similarity alone cannot.

The embedding ranks 황 and 황황하다 second and third for 황혼 while 저녁노을 sits
ninth: the contamination outranks the real neighbour, so no cut on the score can
keep one and drop the other. Orthography cannot separate them either — Korean
derivation means a shared first syllable often *is* a shared root (노을 → 노란색),
and photo co-occurrence is worse than useless here, running higher on the
contaminated pairs than on the clean ones (docs/36 §14-3).

What is left is reading the meaning. Judged per head rather than per pair: 30
candidates in one prompt is 2,647 calls instead of 79,410, and the model ranks
better when it sees the candidates together.

Writes one JSON line per head as it goes, and skips what is already there, so an
interrupted run resumes instead of starting over.
"""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
RESULT = OUT / "neighbor-judgments.jsonl"
MODEL, CANDIDATES = "qwen3:8b", 30

SYSTEM = (
    "너는 사진 검색의 무드 어휘를 다듬는다. 기준 무드로 검색한 사람에게 "
    "대신 보여줘도 납득할 후보만 고른다.\n"
    "고름: 뜻이 같거나, 결이 비슷하거나, 같은 장면에 함께 나타난다.\n"
    "버림: 글자만 비슷하고 뜻이 다른 것, 관계가 먼 것.\n"
    "출력은 고른 낱말만 쉼표로. 설명 금지."
)


def ask(head_text, candidate_texts, retries=3):
    message = [f"기준: {head_text}", "", "후보:"] + [f"- {t}" for t in candidate_texts]
    body = json.dumps({
        "model": MODEL, "think": False, "stream": False,
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": "\n".join(message)}],
        "options": {"temperature": 0, "num_predict": 200},
    }).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=body,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=900) as r:
                return json.loads(r.read())["message"]["content"].strip()
        except (urllib.error.URLError, TimeoutError, KeyError):
            if attempt == retries - 1:
                raise
            time.sleep(3 * (attempt + 1))


def parse(answer, candidates):
    """모델이 낱말만 돌려주지만 뜻풀이째 돌려줄 때가 있다. 후보에 있는 것만 받는다."""
    kept, seen = [], set()
    for piece in answer.replace("\n", ",").split(","):
        token = piece.strip().strip("-·").split(":")[0].strip()
        if not token:
            continue
        for candidate in candidates:
            if candidate not in seen and (token == candidate or token.startswith(candidate)):
                kept.append(candidate)
                seen.add(candidate)
                break
    return kept


def main():
    data = json.loads((OUT / "head-texts.json").read_text(encoding="utf-8"))
    heads, texts = data["heads"], dict(zip(data["heads"], data["c"]))
    top = np.load(OUT / "head-neighbors.npy")
    scores = np.load(OUT / "head-neighbor-scores.npy")

    done = set()
    if RESULT.exists():
        for line in RESULT.read_text(encoding="utf-8").splitlines():
            if line.strip():
                done.add(json.loads(line)["head"])
    todo = [h for h in heads if h not in done]
    print(f"판정 대상 {len(todo):,} / {len(heads):,}  (완료 {len(done):,})", flush=True)

    started = time.time()
    with RESULT.open("a", encoding="utf-8") as fp:
        for n, head in enumerate(todo, 1):
            i = heads.index(head)
            cands = [heads[j] for j in top[i][:CANDIDATES]]
            answer = ask(texts[head], [texts[c] for c in cands])
            kept = parse(answer, cands)
            rank = {c: k for k, c in enumerate(cands)}
            fp.write(json.dumps({"head": head, "kept": kept,
                                 "scores": {c: round(float(scores[i][rank[c]]), 4) for c in kept},
                                 "dropped": [c for c in cands if c not in kept]},
                                ensure_ascii=False) + "\n")
            fp.flush()
            if n % 50 == 0:
                rate = n / (time.time() - started)
                print(f"  {n:,}/{len(todo):,}  {rate:.2f}/s  남은 {(len(todo)-n)/rate/60:.0f}분", flush=True)
    print("완료", flush=True)


if __name__ == "__main__":
    main()

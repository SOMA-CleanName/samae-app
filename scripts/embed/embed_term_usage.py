"""검색어 벡터 — 낱말 + 뜻풀이 + 사진 용례 (docs/40 §14-5 의 (c), §17-5, 2026-09-22).

뜻풀이만으로는 같은 묶음 짝을 상위 10 이웃 안에 40% 밖에 못 찾았다 — 뜻이 여러 개인 긴 뜻풀이가 벡터를 흐린다.
§14-4 에서처럼 사진 용례 한 줄을 붙인다(신물 → "넌더리 난 표정" 이 붙어야 지긋지긋하다가 1위로 온다).

  입력  기존 검색어(번들, 건드리지 않음) + 새 검색어(mood-edits/new-terms.json) + 용례(mood-edits/term-usage.jsonl)
  문장  "{검색어}: {뜻풀이 앞 200자} / 사진: {용례}"
  모델  qwen3-embedding:8b (VRAM 을 쓰므로 SigLIP 컨테이너는 내려 둔다)

출력: out/mood-vocabulary/term-usage-vectors.npy (float16, 정규화) · term-usage-index.json {terms: [{term, old, group?}]}
"""
import json
import sys
from pathlib import Path

import numpy as np

from build_group_candidates import embed

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
USAGE = EMBED / "mood-edits" / "term-usage.jsonl"


def terms_with_text():
    text = {}
    with (OUT / "screen-pool.jsonl").open(encoding="utf-8") as f:
        for line in f:
            e = json.loads(line)
            text.setdefault(e["word"], e["text"].split(": ", 1)[-1])
    usage = {}
    for line in USAGE.read_text(encoding="utf-8").splitlines():
        if line.strip():
            u = json.loads(line)
            usage[u["term"]] = u["usage"]

    rows = []
    for gi, r in enumerate(json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))["rows"]):
        if r.get("added") or not r["axes"]:
            continue
        by_t = {t: [t] for t in r["terms"]}
        for w, t in r["aliases"].items():
            by_t.setdefault(t, []).append(w)
        for t, ws in by_t.items():
            src = [r["head"], *ws] if t == r["terms"][0] else ws
            rows.append({"term": t, "old": True, "group": gi, "axes": r["axes"], "words": sorted(set(ws)),
                         "definition": " / ".join(dict.fromkeys(text[w] for w in src if w in text))})
    for t in json.loads((EMBED / "mood-edits" / "new-terms.json").read_text(encoding="utf-8"))["terms"]:
        if "old" not in t:
            rows.append({"term": t["term"], "old": False, "axes": t["axes"], "words": t["words"],
                         "definition": " / ".join(dict.fromkeys(text[w] for w in t["words"] if w in text))})
    for r in rows:
        r["usage"] = usage.get(r["term"], "")
    return rows


def main():
    rows = terms_with_text()
    missing = sum(not r["usage"] for r in rows)
    print(f"검색어 {len(rows)} · 용례 없는 것 {missing}")
    texts = [f"{r['term']}: {r['definition'][:200]} / 사진: {r['usage']}" if r["usage"] else f"{r['term']}: {r['definition'][:200]}"
             for r in rows]
    vecs = []
    for i in range(0, len(texts), 64):
        vecs.append(embed(texts[i:i + 64]))
        print(f"  {min(i + 64, len(texts))}/{len(texts)}", end="\r", flush=True)
    print()
    np.save(OUT / "term-usage-vectors.npy", np.concatenate(vecs).astype(np.float16))
    (OUT / "term-usage-index.json").write_text(json.dumps({"terms": rows}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

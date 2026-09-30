"""사진 무드 표현 뼈대 — 용례가 없는 말에 용례를 채운다 (docs/40 §17-6, 2026-09-30).

용례가 없으면 벡터가 낱말 하나로만 만들어져(build_photo_judge_sets.py) 이웃 후보가 낱말끼리 몰린다. 그래서 벡터를 만들기 전에 채운다.
용례는 mood-edits/photo-term-usage.json {묶음 이름: 용례} — Claude 가 쓴 것(사람 결정: AI 판단 그대로 간다). 묶음의 식구 중 용례가 없는 말에 묶음 용례를 넣고,
그래도 없으면 같은 묶음 식구의 용례를 빌린다(묶음 = 바꿔 써도 사진이 같은 말이다).
작가가 쓴 용례가 이미 있으면 건드리지 않는다.

  py fill_photo_term_usage.py   →  out/mood-vocabulary/photo-terms.jsonl 을 제자리에서 고친다 (export-photo-terms.mts 다음, build_photo_judge_sets.py 앞)
"""
import json
import sys
from pathlib import Path

EMBED = Path(__file__).resolve().parent
TERMS = EMBED / "out" / "mood-vocabulary" / "photo-terms.jsonl"
EDITS = EMBED / "mood-edits"


def main():
    usage = json.loads((EDITS / "photo-term-usage.json").read_text(encoding="utf-8"))["usage"]
    groups = json.loads((EDITS / "photo-groups.json").read_text(encoding="utf-8"))["groups"]
    head_of = {t: g["members"][0] for g in groups for t in g["members"]}
    rows = [json.loads(l) for l in TERMS.read_text(encoding="utf-8").splitlines() if l.strip()]
    own = {r["term"]: r["usage"] for r in rows if r["usage"].strip()}
    mate = {g["members"][0]: next((own[t] for t in g["members"] if t in own), "") for g in groups}
    filled = 0
    for r in rows:
        head = head_of.get(r["term"], "")
        u = usage.get(r["term"]) or usage.get(head) or mate.get(head, "")
        if not r["usage"].strip() and u:
            r["usage"] = u
            filled += 1
    TERMS.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    print(f"말 {len(rows)} · 채움 {filled} · 아직 용례 없음 {sum(1 for r in rows if not r['usage'].strip())}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

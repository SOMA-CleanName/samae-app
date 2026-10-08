"""사전 밖 무드 표현 — 새 어휘에 없는 것을 모은다 (docs/40 §17, 2026-09-22).

지금 어휘(5,204개)는 한국어기초사전 표제어에서만 뽑았다. 그래서 사진 쪽에서 가장 많이 쓰는 말이 빠졌다 —
힙한 · 빈티지한 · 필름 감성 · 역광의 · 파스텔톤. 사람이 먼저 골라 둔 검증 후보 140개 중 84개도 새 어휘에 없었다.
사람 결정: 신조어 · 외래어 · 사전 표제어가 아닌 구절도 **전부** 넣는다. 그 뒤 어휘를 처음부터 다시 만든다.

모으는 곳

  shortlisted  검증 후보 140개(out/mood-vocabulary/collection.json 의 selection_status = shortlisted)
  generated    사진·무드 표현 목록 — 축을 나눠 에이전트가 모은 것(mood-edits/additions-generated.jsonl)
  photo-tags   기존 사진 태그. DB 를 읽어야 해서 여기서는 안 모으고, 화면(/admin/photo-purpose/mood?view=extra)이
               열릴 때 읽기만 해서 더한다

새 어휘(검색어 · 별칭 · 묶음 이름 · 식구 낱말)에 이미 있는 표현은 뺀다. 같은 표현이 여러 곳에서 오면 하나로 합치고
출처를 모두 적는다. 결과는 mood-additions.json — DB 에는 아무것도 쓰지 않는다.
"""
import json
import sys
import unicodedata
from pathlib import Path

EMBED = Path(__file__).resolve().parent
COLLECTION = EMBED / "out" / "mood-vocabulary" / "collection.json"
GENERATED = EMBED / "mood-edits" / "additions-generated.jsonl"
OUT = EMBED / "mood-additions.json"
KINDS = {"신조어", "외래어", "구절", "기타"}


def norm(label):
    return " ".join(unicodedata.normalize("NFKC", label).split())


def vocabulary():
    """새 어휘에 이미 있는 말 — 검색어, 별칭, 묶음 이름, 식구 낱말."""
    rows = json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))["rows"]
    groups = json.loads((EMBED / "mood-axes-bundle.json").read_text(encoding="utf-8"))["groups"]
    words = set()
    for r in rows:
        words |= {r["head"], *r["terms"], *r["aliases"]}
    for g in groups:
        words |= {g["head"], *g["members"]}
    return {norm(w) for w in words}


def collect(shortlisted, generated, known):
    entries = {}

    def add(label, axes, kind, source, usage="", prompt=""):
        key = norm(label)
        if not key or key in known:
            return
        e = entries.setdefault(key, {"label": key, "axes": [], "kind": kind, "sources": [], "usage": usage})
        e["axes"] += [a for a in axes if a not in e["axes"]]
        if source not in e["sources"]:
            e["sources"].append(source)
        if usage and not e["usage"]:
            e["usage"] = usage
        if prompt:
            e["prompt"] = prompt

    for s in shortlisted:
        axis = "계절·날씨" if s.get("axis") == "계절" else s.get("axis")   # 옛 축 이름(§8)
        add(s["label"], [axis] if axis else [], "기타", "shortlisted", prompt=s.get("english_prompt", ""))
    for g in generated:
        add(g["label"], g.get("axes", []), g.get("kind") if g.get("kind") in KINDS else "기타", "generated", g.get("usage", ""))
    return sorted(entries.values(), key=lambda e: e["label"])


def main():
    known = vocabulary()
    shortlisted = []
    if COLLECTION.exists():
        shortlisted = [c for c in json.loads(COLLECTION.read_text(encoding="utf-8"))["candidates"]
                       if c.get("selection_status") == "shortlisted"]
    generated = [json.loads(l) for l in GENERATED.read_text(encoding="utf-8").splitlines() if l.strip()] if GENERATED.exists() else []
    entries = collect(shortlisted, generated, known)
    OUT.write_text(json.dumps({"entries": entries}, ensure_ascii=False, indent=1), encoding="utf-8")
    by_source = {}
    for e in entries:
        for s in e["sources"]:
            by_source[s] = by_source.get(s, 0) + 1
    print(json.dumps({"shortlisted_in": len(shortlisted), "generated_in": len(generated), "entries": len(entries),
                      "by_source": by_source}, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

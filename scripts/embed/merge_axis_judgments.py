"""1차 전처리 무드의 축 합치기 (docs/40 §17-4, 2026-09-23).

낱말마다 축의 출처는 셋 중 하나다.
  labeled   사람이 정한 기존 묶음(검색어 번들)의 축 — 2026-09-16 대표 2,647개 판정 + 2차 검토
  inherit   누가 봐도 같은 말 식구(build_word_families.py)에 기존 묶음 낱말이 있어 그 축을 물려받음
  judged    식구 대표를 Claude 가 뜻풀이를 읽고 판정(축 판정 조각 aNNN.jsonl) — 식구가 모두 대표의 축을 쓴다

그 위에 향 축(2026-09-22 추가)을 덮는다 — mood-edits/scent-axes.jsonl {word, axes}. 냄새 · 향 뜻이 있는 낱말만 다시 읽었다.
사람이 정한 축은 빼지 않고 향만 더했다. 향 판정이 있는 낱말은 애매 표시를 푼다.

사용: python merge_axis_judgments.py <축 판정 조각 폴더>
출력: mood-edits/axis-judged.jsonl — {word, axes, sure, how, why?, head?}
"""
import json
import sys
from collections import Counter
from pathlib import Path

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
RESULT = EMBED / "mood-edits" / "axis-judged.jsonl"
AXES = ["감정", "관계", "스타일", "온도", "계절·날씨", "빛", "색감", "질감", "에너지", "공간", "시간대", "향"]


def main(folder):
    folder = Path(folder)
    judged = {}
    for c in sorted(folder.glob("c[0-9][0-9][0-9].jsonl")):
        src = [json.loads(l) for l in c.read_text(encoding="utf-8").splitlines() if l.strip()]
        out = [json.loads(l) for l in (folder / f"a{c.stem[1:]}.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
        if [(o["id"], o["word"]) for o in out] != [(s["id"], s["word"]) for s in src]:
            raise SystemExit(f"조각 {c.stem}: 입력과 id · 낱말 · 순서가 다르다")
        for o in out:
            if not o["axes"] or not set(o["axes"]) <= set(AXES):
                raise SystemExit(f"조각 {c.stem}: 축이 없거나 11축 밖 — {o}")
            judged[o["word"]] = o

    label = {}
    for row in json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))["rows"]:
        if row.get("added") or not row["axes"]:
            continue
        for w in [row["head"], *row["terms"], *row["aliases"]]:
            label.setdefault(w, row["axes"])

    words = [w["w"] for w in json.loads((EMBED / "mood-screen-list.json").read_text(encoding="utf-8"))["words"]]
    families = json.loads((OUT / "word-families.json").read_text(encoding="utf-8"))["families"]
    head_of = {m: f for f in families for m in f["members"]}

    scent_file = EMBED / "mood-edits" / "scent-axes.jsonl"
    scent = {}
    if scent_file.exists():
        scent = {s["word"]: s["axes"] for s in map(json.loads, scent_file.read_text(encoding="utf-8").splitlines()) if s}

    rows, how = [], Counter()
    for w in words:
        f = head_of.get(w)
        order = lambda axes: sorted(set(axes), key=AXES.index)  # noqa: E731
        if w in label:
            row = {"word": w, "axes": order(label[w]), "sure": True, "how": "labeled"}
        elif f and f.get("inherit"):
            row = {"word": w, "axes": order(f["inherit"]), "sure": True, "how": "inherit", "head": f["head"]}
        elif f and f["head"] in judged:
            j = judged[f["head"]]
            row = {"word": w, "axes": order(j["axes"]), "sure": j["sure"], "how": "judged", "why": j.get("why", "")}
            if f["head"] != w:
                row["head"] = f["head"]
        elif f and any(m in label for m in f["members"]):   # 식구 중 사람이 정한 낱말이 있다
            m = next(m for m in f["members"] if m in label)
            row = {"word": w, "axes": order(label[m]), "sure": True, "how": "inherit", "head": m}
        elif w in scent:                                      # 향 축과 함께 되살린 냄새 말 — 식구 계산 뒤에 들어왔다
            row = {"word": w, "axes": order(scent[w]), "sure": True, "how": "scent"}
        else:
            raise SystemExit(f"축이 없는 낱말: {w}")
        if w in scent and set(scent[w]) != set(row["axes"]):
            keep = set(row["axes"]) if row["how"] != "judged" else set()   # 사람이 정한 축은 빼지 않는다
            row["axes"] = order([*scent[w], *keep])
            row["sure"] = True
            row["scent"] = True
        rows.append(row)
        how[row["how"]] += 1
    RESULT.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    per = Counter(a for r in rows for a in r["axes"])
    print(json.dumps({"낱말": len(rows), "출처": dict(how), "애매": sum(not r["sure"] for r in rows),
                      "축 수": dict(sorted(Counter(len(r["axes"]) for r in rows).items())),
                      "축별 낱말": {a: per[a] for a in AXES}}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1])

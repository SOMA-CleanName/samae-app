"""이웃 그래프 입력 문장 — 묶음(2026-09-19 정리) 하나에 한 줄.

처음 그래프(§14)는 대표 사전형 2,647개를 "낱말: 뜻풀이. 용례" 로 넣었다. 그 뒤
검색어를 정리하면서 단위가 묶음으로 바뀌었다 — 슬프다 가 아니라
"슬픈 · 구슬픈 · 서글픈 · 비애" 가 한 단위다. 그래서 입력도 묶음으로 만든다:

  슬픈 (구슬픈·서글픈·비애·비감스러운): <대표 검색어 낱말의 첫 뜻풀이>. <사진 용례>

  - 맨 앞은 대표 검색어. 판정 모델이 이 이름으로 답하고, 화면에도 이 이름이 뜬다
  - 괄호 속 나머지 검색어가 묶음의 폭을 알려 준다 — 대표 하나만 보면 좁게 읽힌다
  - 뜻풀이는 동음이의를 가른다(신물 = 싫증, 맛이 아니다). 용례는 사진 장면을 준다(§14-2 의 (c))
    뜻풀이는 묶음 이름 낱말이 아니라 **대표 검색어의 원래 낱말**에서 가져온다. 혹한 묶음의 이름은
    극한인데, 극한의 첫 뜻풀이는 極限(가장 마지막 단계)이라 추위 묶음을 엉뚱하게 설명한다

검색어가 하나도 없는 묶음은 뺀다. 검색될 일이 없으니 이웃도 필요 없다.
대표 검색어는 묶음마다 다르다(겹침 0) — 이름으로 묶음을 되찾을 수 있다.
"""
import json
from pathlib import Path

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
GLOSS = 80


def gloss_of(row, label, senses):
    """대표 검색어로 흡수된 사전 낱말 중 뜻풀이가 있는 첫 것. 묶음 이름 낱말이 그중 하나면 그것부터."""
    sources = [w for w, t in row["aliases"].items() if t == label] + [label]
    if row["head"] in sources:
        sources.insert(0, row["head"])
    for word in sources:
        first = ((senses.get(word) or {}).get("senses") or [""])[0]
        if first:
            return first[:GLOSS].rstrip(". ")
    return ""


def texts(rows, senses):
    heads, labels, lines = [], [], []
    for row in rows:
        if not row["terms"]:
            continue
        label, rest = row["terms"][0], row["terms"][1:]
        gloss = gloss_of(row, label, senses)
        name = f"{label} ({'·'.join(rest)})" if rest else label
        heads.append(row["head"])
        labels.append(label)
        lines.append(f"{name}: {gloss}. {row['usage']}" if gloss else f"{name}: {row['usage']}")
    if len(set(labels)) != len(labels):
        raise ValueError("대표 검색어가 두 묶음에 겹친다 — 이름으로 묶음을 되찾을 수 없다")
    return {"heads": heads, "labels": labels, "c": lines}


def main():
    rows = json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))["rows"]
    senses = json.loads((EMBED / "mood-review-bundle.json").read_text(encoding="utf-8"))["senses"]
    data = texts(rows, senses)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "head-texts.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    (OUT / "head-order.json").write_text(json.dumps(data["heads"], ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"groups": len(data["heads"]), "sample": data["c"][:3]}, ensure_ascii=False))


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    main()

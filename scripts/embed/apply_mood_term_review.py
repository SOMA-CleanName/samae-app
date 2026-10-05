"""검색어 2차 검토(2026-09-19) 결과를 번들 두 개에 굳힌다.

1차 정리는 뜻이 비슷하면 한 검색어로 흡수해 버렸다(화평히 → 조용한, 무서워하다 → 걱정한).
2차 검토는 묶음마다 다시 판단했다:

  - 흡수는 같은 뿌리의 꼴만 다른 것(조용하다·조용히 → 조용한)과 센말·큰말(깜빡 → 깜박이는)만.
    조금이라도 뜻이 다른 낱말은 자기 검색어로 올린다
  - 대표(첫 검색어)는 묶음의 축에 비춰 가장 넓고 중심인 말 — 글썽대는 이 아니라 슬픈
  - 결이 갈리는 묶음은 쪼갠다 — 걱정(걱정·근심·염려) 과 두려움(두려운·공포·겁먹은)

판단 기록은 mood-edits/term-review-2.jsonl 에 묶음마다 한 줄:
  {"head": 원래 대표, "groups": [{"head", "axes", "usage", "prompts"?,
                                   "terms": [{"term", "from": [사전 낱말…]}]}]}
원래 대표가 든 묶음은 head 가 그대로라 이웃 그래프와 이어진다. 새로 떨어진 묶음은
이웃 그래프에 아직 없다 — 이웃 판정을 다시 돌려야 붙는다.
"""
import json
import sys
from pathlib import Path

EMBED = Path(__file__).resolve().parent
TERMS = EMBED / "mood-terms-bundle.json"
AXES = EMBED / "mood-axes-bundle.json"
REVIEW = EMBED / "mood-edits" / "term-review-2.jsonl"


def apply(terms_bundle, axes_bundle, decisions):
    by_head = {d["head"]: d for d in decisions}
    axis_groups = {g["head"]: g for g in axes_bundle["groups"]}
    existing = {r["head"] for r in terms_bundle["rows"]}
    rows, groups = [], []
    for row in terms_bundle["rows"]:
        old = axis_groups[row["head"]]
        decision = by_head.get(row["head"])
        if decision is None:                       # 낱말 하나짜리 — 판단할 게 없었다
            rows.append(row)
            groups.append(old)
            continue
        for part in decision["groups"]:
            is_origin = part["head"] == row["head"]
            if not is_origin and part["head"] in existing:
                raise ValueError(f"{row['head']}: 새 묶음 head {part['head']} 가 이미 있다")
            existing.add(part["head"])
            terms = [t["term"] for t in part["terms"]]
            aliases = {w: t["term"] for t in part["terms"] for w in t["from"] if w != t["term"]}
            rows.append({
                "head": part["head"], "axes": part["axes"], "usage": part["usage"],
                "terms": terms, "aliases": aliases,
                "made_up": row["made_up"] if is_origin else [], "odd": [],
            })
            words = [w for t in part["terms"] for w in t["from"]]
            groups.append({
                "head": part["head"], "axes": part["axes"],
                "members": [w for w in words if w != part["head"]],
                "prompts": part.get("prompts") or (old["prompts"] if is_origin else []),
                "usage": part["usage"],
            })
    terms_bundle["rows"] = rows
    axes_bundle["groups"] = groups
    return recount(terms_bundle, axes_bundle)


def recount(terms_bundle, axes_bundle):
    """행·묶음을 바꾼 뒤 겹침·개수·축별 집계를 다시 센다. 분리(apply_mood_group_split.py)도 쓴다."""
    rows, groups = terms_bundle["rows"], axes_bundle["groups"]
    owners = {}
    for r in rows:
        for term in r["terms"]:
            owners.setdefault(term, []).append(r["head"])
    terms_bundle["collisions"] = {t: hs for t, hs in owners.items() if len(hs) > 1}
    terms_bundle["terms"] = sum(len(r["terms"]) for r in rows)
    terms_bundle["aliases"] = sum(len(r["aliases"]) for r in rows)

    axes_bundle["heads"] = len(groups)
    axes_bundle["words"] = sum(1 + len(g["members"]) for g in groups)
    per_axis = {}
    for g in groups:
        for axis in g["axes"]:
            tally = per_axis.setdefault(axis, {"heads": 0, "words": 0})
            tally["heads"] += 1
            tally["words"] += 1 + len(g["members"])
    axes_bundle["per_axis"] = per_axis
    return terms_bundle, axes_bundle


def main():
    terms_bundle = json.loads(TERMS.read_text(encoding="utf-8"))
    axes_bundle = json.loads(AXES.read_text(encoding="utf-8"))
    # 낱말은 대표 + 식구 + 별칭이다. 1차 정리 때 되살린 낱말은 식구에 없고 별칭에만 있어 셋을 합쳐 센다.
    members = {g["head"]: g["members"] for g in axes_bundle["groups"]}
    words_before = sum(len({r["head"], *members[r["head"]], *r["aliases"]}) for r in terms_bundle["rows"])
    decisions = [json.loads(l) for l in REVIEW.read_text(encoding="utf-8").splitlines() if l.strip()]
    terms_bundle, axes_bundle = apply(terms_bundle, axes_bundle, decisions)
    if axes_bundle["words"] != words_before:
        raise SystemExit(f"낱말 수가 바뀌었다 {words_before} → {axes_bundle['words']} — 빠지거나 겹친 낱말이 있다")
    TERMS.write_text(json.dumps(terms_bundle, ensure_ascii=False), encoding="utf-8")
    AXES.write_text(json.dumps(axes_bundle, ensure_ascii=False), encoding="utf-8")
    rows = terms_bundle["rows"]
    print(json.dumps({"groups": len(rows), "terms": terms_bundle["terms"],
                      "distinct": len({t for r in rows for t in r["terms"]}),
                      "aliases": terms_bundle["aliases"], "collisions": len(terms_bundle["collisions"]),
                      "words": axes_bundle["words"]}, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

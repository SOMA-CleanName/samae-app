"""묶음 분리(3차 검토, 2026-09-19)를 번들 두 개에 굳힌다.

2차 검토로 흡수를 풀자 한 묶음에 결이 다른 검색어가 여럿 남았다
(외로운 · 공허한 · 외딴 · 구슬픈 이 한 묶음). 3차는 검색어 하나하나를 보고 나눴다:

  - keep: 원래 묶음에 남는 검색어. 첫 것이 새 대표. head 는 그대로라 이웃 그래프와 이어진다
  - new : 떼어 내 새로 만든 묶음 — 원래 묶음 바로 뒤에 들어간다
  - move: 이미 있는 다른 묶음으로 보낸다 (구슬픈 → 슬픈 묶음). 목적지에 같은 검색어가 있으면 합친다
  - keep 이 비면 묶음을 없앤다 — 검색어는 모두 옮겨 가고, 묶음 이름 낱말은 첫 목적지의 식구가 된다
    (부러워하다[부러운] 과 부럽다[부러운] 처럼 같은 무드가 두 묶음으로 갈라져 있던 것을 합칠 때)

검색어에 딸린 사전 낱말(별칭·식구)도 검색어를 따라간다.
판단 기록은 mood-edits/ 에 묶음마다 한 줄 — term-split-3.jsonl(분리), term-merge-4.jsonl(겹침 정리).
"""
import json
import sys
from pathlib import Path

from apply_mood_term_review import recount

EMBED = Path(__file__).resolve().parent
TERMS = EMBED / "mood-terms-bundle.json"
AXES = EMBED / "mood-axes-bundle.json"
DECISIONS = EMBED / "mood-edits" / (sys.argv[1] if len(sys.argv) > 1 else "term-split-3.jsonl")


def words_of(row, group, term):
    """검색어 하나에 딸린 사전 낱말. 묶음 head 는 묶음을 떠날 수 없으니 빼고 센다."""
    words = [w for w, t in row["aliases"].items() if t == term]
    if term in group["members"] and term not in words:
        words.append(term)
    return [w for w in words if w != row["head"]]


def split(terms_bundle, axes_bundle, decisions):
    rows = {r["head"]: r for r in terms_bundle["rows"]}
    groups = {g["head"]: g for g in axes_bundle["groups"]}
    order = [r["head"] for r in terms_bundle["rows"]]
    after = {}                                  # 원래 head → 그 뒤에 끼울 새 head 들
    moves, dissolved = [], {}
    for d in decisions:
        row, group = rows[d["head"]], groups[d["head"]]
        carried = {t: {"aliases": {w: t for w, v in row["aliases"].items() if v == t},
                       "words": words_of(row, group, t)} for t in row["terms"]}
        for n in d.get("new", []):
            if n["head"] in rows:
                raise ValueError(f"{d['head']}: 새 묶음 head {n['head']} 가 이미 있다")
            aliases = {w: t for t in n["terms"] for w, t in carried[t]["aliases"].items()}
            members = [w for t in n["terms"] for w in carried[t]["words"] if w != n["head"]]
            rows[n["head"]] = {"head": n["head"], "axes": n["axes"], "usage": n["usage"],
                               "terms": list(n["terms"]), "aliases": aliases, "made_up": [], "odd": []}
            groups[n["head"]] = {"head": n["head"], "axes": n["axes"], "members": members,
                                 "prompts": n["prompts"], "usage": n["usage"]}
            after.setdefault(d["head"], []).append(n["head"])
        for m in d.get("move", []):
            moves.append((m["to"], m["terms"], carried))
        leaving = {t for n in d.get("new", []) for t in n["terms"]} | {t for m in d.get("move", []) for t in m["terms"]}
        gone = {w for t in leaving for w in carried[t]["words"]}
        if not d["keep"]:
            if not d.get("move"):
                raise ValueError(f"{d['head']}: 남기는 것도 옮기는 것도 없다")
            dissolved[d["head"]] = d["move"][0]["to"]
        row["terms"] = list(d["keep"])
        row["aliases"] = {w: t for w, t in row["aliases"].items() if t in d["keep"]}
        if d.get("keep_axes"):
            row["axes"] = group["axes"] = list(d["keep_axes"])
        group["members"] = [w for w in group["members"] if w not in gone]
    # 옮김은 분리가 다 끝난 뒤에 붙인다 — 목적지도 이번에 쪼개졌을 수 있다(head 는 남아 있다).
    for to, moved, carried in moves:
        if to in dissolved:
            raise ValueError(f"{to} 은 없어지는 묶음이라 옮겨 받을 수 없다")
        row, group = rows[to], groups[to]
        for t in moved:
            if t not in row["terms"]:
                row["terms"].append(t)
            row["aliases"].update(carried[t]["aliases"])
            group["members"] += [w for w in carried[t]["words"] if w not in group["members"] and w != to]
    for head, to in dissolved.items():
        group = groups[to]
        group["members"] += [w for w in [head, *groups[head]["members"]] if w not in group["members"] and w != to]
    heads = [h for head in order for h in [head, *after.get(head, [])] if h not in dissolved]
    terms_bundle["rows"] = [rows[h] for h in heads]
    axes_bundle["groups"] = [groups[h] for h in heads]
    return recount(terms_bundle, axes_bundle)


def main():
    terms_bundle = json.loads(TERMS.read_text(encoding="utf-8"))
    axes_bundle = json.loads(AXES.read_text(encoding="utf-8"))
    words_before, terms_before = axes_bundle["words"], terms_bundle["terms"]
    decisions = [json.loads(l) for l in DECISIONS.read_text(encoding="utf-8").splitlines() if l.strip()]
    terms_bundle, axes_bundle = split(terms_bundle, axes_bundle, decisions)
    rows = terms_bundle["rows"]
    summary = {"groups": len(rows), "terms": terms_bundle["terms"], "terms_before": terms_before,
               "distinct": len({t for r in rows for t in r["terms"]}),
               "aliases": terms_bundle["aliases"], "collisions": len(terms_bundle["collisions"]),
               "words": axes_bundle["words"], "words_before": words_before}
    if axes_bundle["words"] != words_before:
        raise SystemExit(f"낱말 수가 바뀌었다 — 저장하지 않는다 {json.dumps(summary, ensure_ascii=False)}")
    TERMS.write_text(json.dumps(terms_bundle, ensure_ascii=False), encoding="utf-8")
    AXES.write_text(json.dumps(axes_bundle, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

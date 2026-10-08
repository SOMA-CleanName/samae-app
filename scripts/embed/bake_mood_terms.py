"""검색어 정리 화면에서 고친 것을 번들에 굳힌다.

화면은 자동 생성분(번들)과 사람 수정분(mood-edits/term-edits.jsonl)을 따로 쌓아 합쳐 보여 준다.
정리가 끝나면 수정 기록을 더 들고 다닐 이유가 없다 — 결과를 번들에 넣고 기록을 비운다.

  - 고친 꼴(외로움 → 외로운): 검색어를 바꾸고, 옛 꼴을 가리키던 별칭도 새 꼴로 옮긴다
  - 버린 검색어: 사라지지 않는다. 그 묶음의 대표 검색어를 가리키는 별칭으로 남는다
  - 되살린 낱말: 검색어가 되고 별칭에서 빠진다

번들은 원래 build_mood_terms_bundle.py 가 normalized-terms.jsonl 에서 만들었다.
굳힌 뒤로는 번들이 정본이다 — 그 스크립트를 다시 돌리면 굳힌 결과가 덮인다.
"""
import json
import sys
from pathlib import Path

EMBED = Path(__file__).resolve().parent
BUNDLE = EMBED / "mood-terms-bundle.json"
EDITS = EMBED / "mood-edits" / "term-edits.jsonl"


def bake(bundle, edits):
    rows = {r["head"]: r for r in bundle["rows"]}
    for e in edits:
        row = rows.get(e["head"])
        if row is None or e["action"] not in ("rename", "drop", "add"):
            continue                                   # 옛 묶음의 기록이거나 피드백 — 굳힐 게 없다
        terms, aliases, t = row["terms"], row["aliases"], e["term"]
        if e["action"] == "rename" and e.get("to"):
            to = e["to"]
            if t in terms:
                terms[terms.index(t)] = to
            elif to not in terms:
                terms.append(to)
            for w, target in aliases.items():
                if target == t:
                    aliases[w] = to
            if t != to:
                aliases[t] = to                        # 옛 꼴로 찾아도 걸리게
            aliases.pop(to, None)
        elif e["action"] == "drop" and t in terms:
            terms.remove(t)
            aliases[t] = None                          # 대표가 정해지면 아래에서 채운다
        elif e["action"] == "add" and t not in terms:
            terms.append(t)
            aliases.pop(t, None)
    for row in rows.values():
        head_form = row["aliases"].get(row["head"])
        rep = head_form if head_form in row["terms"] else (row["terms"][0] if row["terms"] else None)
        # 버렸거나 가리키던 검색어가 사라진 별칭은 대표로 모은다. 검색어가 하나도 없으면 별칭도 둘 데가 없다.
        row["aliases"] = {w: (target if target in row["terms"] else rep)
                          for w, target in row["aliases"].items()
                          if (target in row["terms"] or rep) and w not in row["terms"]}
        row["odd"] = []                                # 꼴 검수는 끝났다
    owners = {}
    for row in rows.values():
        for term in row["terms"]:
            owners.setdefault(term, []).append(row["head"])
    bundle["collisions"] = {t: hs for t, hs in owners.items() if len(hs) > 1}
    bundle["terms"] = sum(len(r["terms"]) for r in rows.values())
    bundle["aliases"] = sum(len(r["aliases"]) for r in rows.values())
    return bundle


def main():
    bundle = json.loads(BUNDLE.read_text(encoding="utf-8"))
    edits = [json.loads(l) for l in EDITS.read_text(encoding="utf-8").splitlines() if l.strip()]
    bundle = bake(bundle, edits)
    BUNDLE.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    EDITS.write_text("", encoding="utf-8")
    print(json.dumps({"baked_edits": len(edits), "terms": bundle["terms"],
                      "distinct": len({t for r in bundle["rows"] for t in r["terms"]}),
                      "aliases": bundle["aliases"], "collisions": len(bundle["collisions"]),
                      "empty": sum(1 for r in bundle["rows"] if not r["terms"])}, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

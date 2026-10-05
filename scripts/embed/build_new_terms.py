"""새 무드 낱말 → 검색어(D1) 합치기 (docs/40 §17-5, 2026-09-22).

  흡수 판정   absorb-sets.jsonl 의 뭉치를 에이전트가 가른 것(판정 폴더/wNNN/oNNN.jsonl) — 같은 뿌리 · 같은 뜻만 한 검색어
  꼴 고르기   뭉치 밖 동사를 -는 · 지난 꼴 중 고른 것(꼴 폴더/wNNN/tNNN*.jsonl)
  나머지      규칙 — 명사 · 부사는 그대로, 형용사는 -ㄴ/-은(korean_form)

판정은 korean_form 을 고치기 전(잡다 → 자운, 뒹굴다 → 뒹굴는)의 꼴 글자로 했다. 고르기 전 꼴을 적어 둔 legacy-forms.json 으로
에이전트가 고른 것이 -는 쪽인지 지난 꼴 쪽인지만 읽고, 글자는 고친 규칙으로 다시 만든다. "다" 로 끝나는 명사(바다)와
문장(모난 돌이 정 맞는다)은 낱말 그대로다.

기존 검색어 · 묶음은 건드리지 않는다. 기존 검색어의 다른 꼴이면 old 에 그 검색어를 적기만 한다 — 글자가 기존 검색어와 같아도 그렇다
(검색어는 글자로 찾으니 같은 글자는 같은 검색어다).

사용: python build_new_terms.py <흡수 판정 폴더> <꼴 폴더> <legacy-forms.json>
출력: mood-edits/new-terms.json — {terms: [{term, words, old?, axes}], collisions, counts}
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

from build_term_absorb_candidates import pos_of, term_forms
from korean_form import adnominal

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
RESULT = EMBED / "mood-edits" / "new-terms.json"


def jsonl(path):
    return [json.loads(l) for l in Path(path).read_text(encoding="utf-8").splitlines() if l.strip()]


def main(absorb_dir, form_dir, legacy_path):
    words = json.loads((EMBED / "mood-screen-list.json").read_text(encoding="utf-8"))["words"]
    by_w = {w["w"]: w for w in words}
    legacy = json.loads(Path(legacy_path).read_text(encoding="utf-8"))
    pos = pos_of()

    old_terms = set()
    old_words = set()
    old_term_of = {}                                    # 기존 낱말 → 그 검색어
    for row in json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))["rows"]:
        if not row.get("added"):
            old_terms.update(row["terms"])
            old_words.update([row["head"], *row["terms"], *row["aliases"]])
            old_term_of.update(row["aliases"])
            for t in row["terms"]:
                old_term_of.setdefault(t, t)
            if row["terms"]:
                old_term_of.setdefault(row["head"], row["terms"][0])

    def repair(chosen, members):
        """에이전트가 고른 옛 꼴 글자 → 고친 규칙의 글자"""
        for w in members:
            opts = term_forms(w, pos.get(w, set()))
            if chosen == w or chosen in opts:
                return chosen if chosen in opts or len(opts) == 1 else opts[0]
            lg = legacy.get(w)
            if lg and chosen in (lg["is"], lg["past"]):
                if len(opts) == 1:
                    return opts[0]
                p = pos.get(w, set())
                if chosen == lg["is"]:
                    return adnominal(w, verb=True)
                return adnominal(w) if "형용사" in p and "동사" not in p else adnominal(w, verb=True, past=True)
        return None

    terms, unfixed = [], []
    covered = set()
    for d in sorted(Path(absorb_dir).glob("w[0-9][0-9][0-9]")):
        n = d.name[1:]
        src = {s["set"]: s for s in jsonl(d / f"b{n}.jsonl")}
        for o in jsonl(d / f"o{n}.jsonl"):
            units = {u["u"]: u for u in src[o["set"]]["units"]}
            for g in o["groups"]:
                members = [w for u in g["units"] for w in units[u]["words"]]
                t = repair(g["term"], members)
                if t is None:
                    unfixed.append((g["term"], members)); t = g["term"]
                terms.append({"term": t, "words": sorted(members), "old": g.get("old")})
                covered.update(members)

    chosen = {}
    for f in sorted(Path(form_dir).glob("w[0-9][0-9][0-9]/t*.jsonl")):
        for x in jsonl(f):
            chosen[x["word"]] = x["term"]

    units = json.loads((OUT / "group-units.json").read_text(encoding="utf-8"))["units"]
    for u in units:
        if any(w in covered for w in u):
            continue
        olds = [w for w in u if w in old_words]
        if olds:                                         # 식구에 기존 낱말이 있다 — 새 낱말은 그 검색어의 꼴이다
            new = [w for w in u if w not in old_words]
            if new:
                terms.append({"term": old_term_of.get(olds[0], olds[0]), "words": sorted(new), "old": old_term_of.get(olds[0], olds[0]),
                              "family_of_old": True})
            covered.update(u)
            continue
        w = u[0]
        if w in chosen:
            t = repair(chosen[w], [w])
            if t is None:
                unfixed.append((chosen[w], u)); t = chosen[w]
        else:
            t = term_forms(w, pos.get(w, set()))[0]
        terms.append({"term": t, "words": sorted(u), "old": None})
        covered.update(u)

    same_string = 0
    for t in terms:
        if not t["old"] and t["term"] in old_terms:      # 글자가 기존 검색어와 같다 — 같은 검색어다
            t["old"] = t["term"]; t["same_string"] = True; same_string += 1
        t["axes"] = sorted(set().union(*[by_w[w]["axes"] for w in t["words"] if w in by_w]))
        if not t["old"]:
            t.pop("old")

    # 글자가 같은 새 검색어는 하나로 합친다 — 검색은 글자로 찾는다(인색하다 → 인색한 과 목록의 인색한).
    # 뜻이 다른 동음이의어(선 · 설다 → 선)도 합쳐지므로 무엇을 합쳤는지 collisions 에 남긴다
    by_term = defaultdict(list)
    for i, t in enumerate(terms):
        if "old" not in t:
            by_term[t["term"]].append(i)
    collisions = {k: [terms[i]["words"] for i in v] for k, v in by_term.items() if len(v) > 1}
    drop = set()
    for k, v in by_term.items():
        if len(v) > 1:
            first = terms[v[0]]
            for i in v[1:]:
                first["words"] = sorted(set(first["words"]) | set(terms[i]["words"]))
                first["axes"] = sorted(set(first["axes"]) | set(terms[i]["axes"]))
                drop.add(i)
    terms = [t for i, t in enumerate(terms) if i not in drop]

    missing = [w for w in by_w if w not in covered and w not in old_words]
    counts = {"새 검색어": sum("old" not in t for t in terms), "기존 검색어의 꼴": sum("old" in t for t in terms),
              "그중 글자가 같아 이은 것": same_string, "흡수된 낱말": sum(len(t["words"]) - 1 for t in terms),
              "글자가 겹치는 새 검색어": len(collisions), "꼴을 못 고친 것": len(unfixed), "빠진 낱말": len(missing)}
    RESULT.write_text(json.dumps({"terms": terms, "collisions": collisions, "counts": counts}, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(counts, ensure_ascii=False, indent=1))
    for x in unfixed[:10]:
        print("  못 고침:", x)
    for k, v in list(collisions.items())[:10]:
        print("  겹침:", k, v)
    if missing:
        print("  빠짐:", missing[:10])


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(*sys.argv[1:4])

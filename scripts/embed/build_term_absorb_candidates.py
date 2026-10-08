"""새 무드 낱말 → 검색어(D1) 흡수 후보 (docs/40 §17-5, 2026-09-22).

옛 1 · 2차(§15)와 같은 원칙이다. **흡수는 같은 뿌리의 꼴만 다른 것뿐이다** — X하다 · X히 · X스럽다 · X롭다 · X적 ·
X되다 · X대다 · X거리다 · 첩어 · 명사형 · X감/X심 · 센말 · 큰말(깜박 · 깜빡 · 껌벅). 조금이라도 뜻이 다르면 검색어로 올린다.
흡수된 낱말은 지우지 않고 검색 별칭으로 산다. 검색어는 "{검색어} 사진" 이 자연스러운 꼴(korean_form.adnominal)이다.

여기서는 뿌리가 겹치는 식구들을 모아 판정 조각을 만들기만 한다 — 판정은 에이전트가 뜻풀이를 읽고 한다
(뿌리가 같아도 뜻이 갈린다: 나풀대다 ≠ 나불대다). 뿌리가 기존 검색어와 겹치면 참고로 붙인다 — 기존 검색어 · 묶음은
건드리지 않고 "그 검색어의 꼴" 이라고 적기만 한다.

출력: out/mood-vocabulary/absorb-sets.jsonl — {set, units: [{u, words, forms, definition, axes}], old: [{term, head}]}
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

from build_cluster_candidates import root, soften
from korean_form import adnominal, is_adverb

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
MAX_SET = 16        # 이보다 크면 소리 변형 맞추기를 빼고 다시 가른다(두 글자 뿌리가 너무 많이 모인다)


def term_forms(w, p):
    """검색어로 쓸 수 있는 꼴. "다" 로 끝나도 명사(바다 · 별바다)와 문장(모난 돌이 정 맞는다)은 그대로다.
    동사는 -는 · 지난 꼴 둘 다(빛나는 · 겁먹은), 형용사는 -ㄴ/-은 하나. 품사를 모르면 둘 다 준다."""
    if not w.endswith("다") or w.endswith(("는다", "ㄴ다")) or (p and not p & {"동사", "형용사"}):
        return [w]
    if "형용사" in p and "동사" not in p:
        return [adnominal(w)]
    return sorted({adnominal(w, verb=True), adnominal(w, verb=True, past=True)} | ({adnominal(w)} if "형용사" in p else set()))


def pos_of():
    pos = defaultdict(set)
    for line in (OUT / "opendict-pool.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            e = json.loads(line)
            pos[e["word"]].update(s["pos"] for s in e["senses"])
    for w, p in json.loads((OUT / "dict-pos.json").read_text(encoding="utf-8")).items():
        pos[w].update(p)
    return pos


def main():
    words = json.loads((EMBED / "mood-screen-list.json").read_text(encoding="utf-8"))["words"]
    by_w = {w["w"]: w for w in words}
    bundle = json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))
    old_word, old_root = {}, defaultdict(set)          # 기존 낱말 → 검색어, 뿌리 → 기존 검색어
    head_of_term = {}
    for row in bundle["rows"]:
        if row.get("added"):
            continue
        for t in row["terms"]:
            head_of_term.setdefault(t, row["head"])
            old_root[root(t)].add(t)
        for w, t in row["aliases"].items():
            old_word[w] = t
        old_word.setdefault(row["head"], row["terms"][0] if row["terms"] else row["head"])

    units = json.loads((OUT / "group-units.json").read_text(encoding="utf-8"))["units"]
    new_units = [u for u in units if not any(w in old_word or w in head_of_term for w in u)]
    pos = pos_of()
    text = {}
    with (OUT / "screen-pool.jsonl").open(encoding="utf-8") as f:
        for line in f:
            e = json.loads(line)
            text.setdefault(e["word"], e["text"].split(": ", 1)[-1])

    def forms(w):
        return term_forms(w, pos.get(w, set()))[0]

    def options(u):
        """검색어로 고를 수 있는 꼴 — 에이전트는 이 중에서만 고른다(지어내지 않게, §15-2). 동사는 -는 · -은 둘 다 준다(겁먹은 · 빛나는)"""
        out = set()
        for w in u:
            if not is_adverb(w) or w.endswith("다"):
                out |= set(term_forms(w, pos.get(w, set())))
        return sorted(out or {u[0]})

    def roots(u, soft=True):
        """뿌리 — soft=False 면 소리 변형(깜빡 → 깜박)을 맞추지 않은 글자 그대로의 뿌리"""
        out = set()
        for w in u:
            for x in {w, forms(w)}:
                r = root(x)
                if len(r) < 2:
                    continue
                if not soft:
                    raw = x.replace(" ", "")
                    r = next((raw[:n] for n in range(len(raw), 1, -1) if soften(raw[:n]) == r), r)
                out.add(r)
        return out

    parent = list(range(len(new_units)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    by_root = defaultdict(list)
    for i, u in enumerate(new_units):
        for r in roots(u):
            by_root[r].append(i)
    for members in by_root.values():
        for j in members[1:]:
            parent[find(j)] = find(members[0])
    comps = defaultdict(list)
    for i in range(len(new_units)):
        comps[find(i)].append(i)

    sets = []
    for comp in comps.values():
        rs = set().union(*[roots(new_units[i]) for i in comp])
        olds = sorted(set().union(*[old_root.get(r, set()) for r in rs]))
        if len(comp) < 2 and not olds:
            continue
        if len(comp) > MAX_SET:                         # 소리 변형 없이 글자 그대로의 뿌리로 다시 가른다
            sub = defaultdict(list)
            for i in comp:
                sub[min(roots(new_units[i], soft=False) or {new_units[i][0]})].append(i)
            parts = [p for p in sub.values()]
        else:
            parts = [comp]
        for p in parts:
            prs = set().union(*[roots(new_units[i]) for i in p])
            po = sorted(set().union(*[old_root.get(r, set()) for r in prs]))
            if len(p) >= 2 or po:
                sets.append((p, po))

    with (OUT / "absorb-sets.jsonl").open("w", encoding="utf-8") as f:
        for k, (p, po) in enumerate(sorted(sets, key=lambda s: min(new_units[i][0] for i in s[0]))):
            f.write(json.dumps({"set": k + 1, "units": [
                {"u": i, "words": new_units[i], "forms": options(new_units[i]),
                 "definition": " / ".join(dict.fromkeys(text.get(w, by_w[w].get("why", "")) for w in new_units[i]))[:300],
                 "axes": sorted(set().union(*[by_w[w]["axes"] for w in new_units[i]]))} for i in sorted(p)],
                "old": [{"term": t, "head": head_of_term[t]} for t in po]}, ensure_ascii=False) + "\n")
    in_sets = sum(len(p) for p, _ in sets)
    print(json.dumps({"새 단위": len(new_units), "후보 뭉치": len(sets), "뭉치에 든 단위": in_sets,
                      "기존 검색어가 붙은 뭉치": sum(bool(po) for _, po in sets),
                      "뭉치 크기": dict(sorted(Counter(len(p) for p, _ in sets).items()))}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

"""누가 봐도 같은 말끼리 먼저 묶기 — 축 판정 전 (docs/40 §17-4, 2026-09-23).

사전이 **직접 같은 말이라고 적어 둔 것만** 잇는다. 뜻이 비슷한 말(비슷한 말 · 유의어)은 잇지 않는다 — 그건 축을 붙인 뒤
다시 묶는 단계에서 한다.

  1. 뜻풀이가 **모두** 다른 말을 가리킨다 — "‘가각하다’의 어근", "‘깜빡이다’의 센말", "‘가느다랗다’의 준말",
     본말 · 원말 · 잘못 · 큰말 · 작은말 · 여린말 · 거센말 · 센말 · 변한 말.
     제 뜻이 하나라도 있으면 잇지 않는다(멋 = 스타일 — "‘멋하다’의 준말" 뜻도 있지만 다른 말이다).
     여러 말을 가리키면 잇지 않는다(아늑 → 아늑하다 · 아늑거리다 — 아늑한과 아느작거리다가 한 식구가 됐었다)
  2. 부사가 "X하게" 로만 풀이된다 — 가각히: 가각하게 → 가각하다
  (띄어쓰기만 다른 표기 · 관형형과 사전형은 이미 한 낱말이다 — mood-screen-list.json 의 alt · master same_as)

기존 검색어 묶음(2,731)은 건드리지 않는다 — 흡수 · 이동 · 수정 없음. 새 낱말의 식구에 기존 묶음 낱말이 있으면
그 묶음의 축을 물려받는다고 표시만 한다(inherit). 기존 묶음 둘을 잇는 고리는 끊는다.

입력: mood-screen-list.json · out/mood-vocabulary/opendict-pool.jsonl · senses.json · master-words.jsonl · mood-terms-bundle.json
출력: out/mood-vocabulary/word-families.json — {families: [{head, members, inherit?}], counts}
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
REF = re.compile(r"[‘'「]([^’'」]+)[’'」]\s*(?:의|를|을)?\s*(어근|준말|본말|원말|잘못|큰말|작은말|여린말|거센말|센말|변한 말)")
ADV = re.compile(r"^(.+?)하게\s*[.。]?\s*$")


def clean(w):
    return re.sub(r"[\d^\-]", "", w).strip()


def main():
    words = json.loads((EMBED / "mood-screen-list.json").read_text(encoding="utf-8"))["words"]
    in_list = {w["w"] for w in words}
    to_list = {}                                  # 사전 꼴 · 다른 표기 → 목록의 낱말
    for w in words:
        to_list[w["w"]] = w["w"]
        for a in w.get("alt", []):
            to_list.setdefault(a, w["w"])
    for line in (OUT / "master-words.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            m = json.loads(line)
            if m.get("same_as") in in_list:
                to_list.setdefault(m["word"], m["same_as"])
            for lemma in m.get("lemmas", []):
                if m["word"] in in_list:
                    to_list.setdefault(lemma, m["word"])

    defs = defaultdict(list)                      # 원래 뜻풀이만(판정 풀 문장에는 가리키는 말의 뜻을 덧붙여 두었다)
    for line in (OUT / "opendict-pool.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            e = json.loads(line)
            defs[e["word"]] += [s["definition"] for s in e["senses"]]
    for entries in json.loads((OUT / "senses.json").read_text(encoding="utf-8"))["entries"].values():
        for e in entries:
            defs[" ".join(e["label"].split())] += [s["definition"] for s in e["senses"]]

    # 기존 묶음 — 낱말 → 묶음 번호, 묶음 → 축
    group_of, group_axes = {}, {}
    for gi, row in enumerate(json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))["rows"]):
        if row.get("added") or not row["axes"]:
            continue
        group_axes[gi] = row["axes"]
        for w in [row["head"], *row["terms"], *row["aliases"]]:
            if w in to_list:
                group_of.setdefault(to_list[w], gi)

    parent = {w: w for w in in_list}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    why, pointed, skipped = Counter(), Counter(), Counter()
    for w in in_list:
        texts = defs.get(w, [])
        if not texts:
            continue
        targets, own_sense = set(), False
        for d in texts:
            refs = [(clean(ref), kind) for ref, kind in REF.findall(d)] if len(d) <= 60 else []
            m = ADV.match(d) if w.endswith(("히", "이", "게")) else None
            if refs:
                for ref, kind in refs:
                    t = to_list.get(ref)
                    if t and t != w:
                        targets.add(t); why[kind] += 1
            elif m and (to_list.get(m.group(1) + "하다") or to_list.get(m.group(1) + "한")):
                t = to_list.get(m.group(1) + "하다") or to_list.get(m.group(1) + "한")
                if t != w:
                    targets.add(t); why["X하게 부사"] += 1
            else:
                own_sense = True                   # 제 뜻이 있다(멋 = 스타일) — 가리키는 뜻풀이가 있어도 잇지 않는다
        if own_sense and targets:
            skipped["제 뜻이 있어 잇지 않음"] += 1
            continue
        if len(targets) > 1:                       # 여러 말을 가리킨다(아늑 → 아늑하다 · 아늑거리다) — 어느 쪽인지 모른다
            skipped["여러 말을 가리켜 잇지 않음"] += 1
            continue
        for t in targets:
            a, b = find(w), find(t)
            if a != b:
                parent[a] = b
                pointed[t] += 1

    fam = defaultdict(list)
    for w in in_list:
        fam[find(w)].append(w)

    families, broken = [], 0
    for members in fam.values():
        groups = {group_of[m] for m in members if m in group_of}
        if len(groups) > 1:                        # 기존 묶음 둘 이상이 한 식구로 이어졌다 — 풀어서 낱말마다 따로 둔다
            broken += 1
            families += [{"head": m, "members": [m]} for m in members]
            continue
        head = max(members, key=lambda m: (m in group_of, pointed[m], m.endswith(("한", "하다", "운", "스러운")), -len(m)))
        item = {"head": head, "members": sorted(members)}
        if groups:
            item["inherit"] = group_axes[next(iter(groups))]
        families.append(item)

    multi = [f for f in families if len(f["members"]) > 1]
    need = [f for f in families if "inherit" not in f]
    counts = {"낱말": len(in_list), "식구": len(families), "둘 이상 식구": len(multi),
              "기존 묶음 축을 물려받는 식구": len(families) - len(need), "축을 새로 정할 대표": len(need),
              "기존 묶음 둘을 이어 푼 식구": broken, "이은 까닭": dict(why.most_common()), "잇지 않은 것": dict(skipped)}
    (OUT / "word-families.json").write_text(json.dumps({"families": families, "counts": counts}, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(counts, ensure_ascii=False, indent=1))
    big = sorted(multi, key=lambda f: -len(f["members"]))[:12]
    for f in big:
        print(f"  {f['head']} ({len(f['members'])}) ← {', '.join(f['members'][:10])}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

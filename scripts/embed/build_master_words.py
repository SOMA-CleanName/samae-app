"""무드 후보 낱말 한데 모으기 — 중복 제거 (docs/40 §17, 2026-09-22).

처음부터 다시 하기 전에, 지금 가진 목록을 모두 합쳐 **글자가 완전히 같은 것만** 하나로 모은다.
유니코드(NFKC)와 띄어쓰기 개수만 정리해서 비교한다.

띄어쓰기는 **표준국어대사전을 따른다**(사람 결정, 2026-09-22). 띄어쓰기만 다른 낱말(가면 무도회 / 가면무도회)은
사전 표기를 기준으로 두고, 다른 표기는 없애지 않고 same_as 로 연결만 한다. 사전의 ^ 는 "띄어 쓰는 것이 원칙,
붙여 쓰기도 허용", - 는 붙여 씀이다. 사전에 없는 쌍(표제어가 아닌 구절)은 사전이 따르는 한글 맞춤법 제2항
"문장의 각 단어는 띄어 쓴다" 로 띄어 쓴 쪽을 기준으로 잇고, 규칙으로 정했다는 뜻으로 spacing_unresolved 를 붙인다.
표기가 다른 것(갬성 / 감성)은 건드리지 않는다.

**꼴은 관형형(~한 · ~는)이 기준이다**(사람 결정 — 검색어는 "{무드} 사진" 꼴, §15). 사전형과 관형형이 둘 다 있으면
(힙하다 / 힙한) 관형형을 살리고 사전형을 same_as 로 연결한다. 사전형이 둘인 관형형(거친 = 거치다 / 거칠다)은
연결하되 lemmas 에 둘 다 적어 뜻이 갈린다는 걸 남긴다.

목록
  opendict     우리말샘 풀 (extract_opendict.py — 옛말·방언·전문 분야 등을 거른 것)
  krdict       한국어기초사전 표제어 (collection.json)
  knu          KNU 한국어 감성사전 (collection.json) — 대부분 뜻풀이 조각이라 가치가 낮다(§17)
  editorial    사진 무드 대표 초안 = 검증 후보 140
  generated    사전 밖 사진 표현 (mood-edits/additions-generated.jsonl)

결과: out/mood-vocabulary/master-words.jsonl — 낱말 하나에 한 줄, 어느 목록에서 왔는지.
"""
import glob
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter
from itertools import combinations
from pathlib import Path

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
MASTER = OUT / "master-words.jsonl"
STDICT = OUT / "stdict-42c0d01889f34536e9cf94fe57f62bd2055b1bde"
SOURCES = ("opendict", "krdict", "knu", "editorial", "generated")
DIGITS = re.compile(r"[0-9]")


def norm(word):
    return " ".join(unicodedata.normalize("NFKC", word).split())


def dict_word(raw):
    """사전 표제어 표기 → 낱말. ^ 는 띄어쓰기, - 는 붙임, 숫자는 동음이의 번호."""
    return norm(DIGITS.sub("", raw.replace("^", " ").replace("-", "")))


def load():
    lists = {s: [] for s in SOURCES}
    for line in (OUT / "opendict-pool.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            lists["opendict"].append(json.loads(line)["word"])
    collection = json.loads((OUT / "collection.json").read_text(encoding="utf-8"))
    label = {c["id"]: c["label"] for c in collection["candidates"]}
    for e in collection["entries"]:
        key = {"krdict-mirror": "krdict", "knu": "knu", "editorial": "editorial"}.get(e["source_id"].split(":")[0])
        if key:
            lists[key].append(label[e["candidate_id"]])
    generated = EMBED / "mood-edits" / "additions-generated.jsonl"
    lists["generated"] = [json.loads(l)["label"] for l in generated.read_text(encoding="utf-8").splitlines() if l.strip()]
    return lists


def merge(lists):
    words = {}
    for source, items in lists.items():
        for raw in items:
            w = norm(raw)
            if w:
                words.setdefault(w, set()).add(source)
    return words


def stdict_spacing():
    """표준국어대사전 표제어: 띄어쓰기를 뺀 글자 → 사전 표기."""
    spelled = {}
    for path in sorted(glob.glob(str(STDICT / "*.xml"))):
        for _, n in ET.iterparse(path, events=("end",)):
            if n.tag == "item":
                raw = n.findtext("word_info/word") or ""
                word = dict_word(raw)
                if word and not raw.startswith("-") and not raw.endswith("-"):
                    spelled.setdefault(word.replace(" ", ""), word)
                n.clear()
    return spelled


def link_spacing(words, spelled):
    """띄어쓰기만 다른 낱말끼리 사전 표기로 잇는다. 없애지 않는다.

    표준국어대사전 표기 → 없으면 우리말샘 표기(같은 ^ · - 표기법, 겉포장 · 게임판 처럼 붙여 쓰는 말이 여기 있다)
    → 둘 다 없으면 한글 맞춤법 제2항 "문장의 각 단어는 띄어 쓴다" 로 띄어 쓴 쪽."""
    groups = {}
    for w in words:
        groups.setdefault(w.replace(" ", ""), []).append(w)
    same_as, unresolved = {}, set()
    for key, ws in groups.items():
        if len(ws) < 2:
            continue
        canonical = spelled.get(key)
        if canonical not in ws:
            in_opendict = [w for w in ws if "opendict" in words[w]]
            canonical = in_opendict[0] if len(in_opendict) == 1 else max(ws, key=lambda w: w.count(" "))
            unresolved.update(ws)
        for w in ws:
            if w != canonical:
                same_as[w] = canonical
    return same_as, unresolved


def link_forms(words, same_as):
    """사전형(힙하다) → 관형형(힙한)이 목록에 있으면 관형형으로 잇는다. 관형형마다 어느 사전형에서 왔는지도 돌려준다."""
    import korean_form
    lemmas = {}
    for w, src in words.items():
        if not w.endswith("다") or w in same_as or not ({"opendict", "krdict"} & src):
            continue
        for verb in (False, True):
            try:
                form = korean_form.adnominal(w, verb=verb)
            except Exception:
                continue
            # 관형형 글자가 따로 사전 표제어면(가문 · 가만 · 간) 다른 낱말이다 — 잇지 않고 둘 다 남긴다.
            # 이걸 빠뜨려 가물다 · 가맣다 · 부옇다 같은 사전형 529개가 남의 뜻풀이에 묻혔었다(2026-09-23 고침)
            if form and form != w and form in words and not ({"opendict", "krdict"} & words[form]):
                lemmas.setdefault(form, set()).add(w)
    links = {}
    for form, ws in lemmas.items():
        target = same_as.get(form, form)
        for w in ws:
            links[w] = target
    return links, {form: sorted(ws) for form, ws in lemmas.items()}


def main():
    lists = load()
    words = merge(lists)
    same_as, unresolved = link_spacing(words, stdict_spacing())
    by_rule = sum(1 for w in unresolved if w in same_as)
    by_stdict = len(same_as) - by_rule
    form_links, lemmas = link_forms(words, same_as)
    same_as.update(form_links)
    per_source = {s: len({norm(x) for x in lists[s] if norm(x)}) for s in SOURCES}
    overlap = {f"{a}∩{b}": sum(1 for src in words.values() if a in src and b in src) for a, b in combinations(SOURCES, 2)}
    spacing = sum(1 for n in Counter(w.replace(" ", "") for w in words).values() if n > 1)
    with MASTER.open("w", encoding="utf-8") as f:
        for w in sorted(words):
            row = {"word": w, "sources": sorted(words[w], key=SOURCES.index)}
            if w in same_as:
                row["same_as"] = same_as[w]
            if w in unresolved:
                row["spacing_unresolved"] = True
            if w in lemmas:
                row["lemmas"] = lemmas[w]
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    only = Counter(next(iter(src)) for src in words.values() if len(src) == 1)
    print(json.dumps({"합치기 전 항목": sum(len(v) for v in lists.values()), "목록별 서로 다른 낱말": per_source,
                      "중복 없앤 낱말": len(words), "한 목록에만 있는 낱말": dict(only),
                      "두 목록 겹침": {k: v for k, v in overlap.items() if v},
                      "띄어쓰기만 다른 묶음": spacing, "표준국어대사전 표기로 연결": by_stdict,
                      "우리말샘 표기·맞춤법 원칙으로 연결": by_rule,
                      "사전형 → 관형형 연결": len(form_links),
                      "사전형이 둘 이상인 관형형": sum(1 for ws in lemmas.values() if len(ws) > 1),
                      "기준 낱말(연결된 표기 제외)": sum(1 for w in words if w not in same_as)}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

"""검색어를 "{무드} 사진" 에 들어가는 꼴로 다듬는다.

기본은 꾸미는 꼴(예쁜 사진·화난 사진·깜박이는 사진), 그게 어색하면 명사(노을 사진).
동사 관형형(~하는·~한)은 형용사처럼 쓰는 말이라 그대로 둔다 — 사람이 정한 규칙이다.

손대는 것은 넷뿐이다.
  - 부사인데 같은 뿌리 형용사가 있는 것      가벼이 → 가벼운
  - 형용사를 명사로 만든 것                 외로움 → 외로운   ('예쁨 사진' 이라고 하지 않는다)
  - 한자어 명사인데 ~하다 형용사가 있는 것    평온 → 평온한
  - 사전형이 남았거나 버그로 깨진 것은 따로 사람이 본다
짝이 없으면 **원래 말 그대로 둔다.** 버려서 묶음을 비우지 않는다.

품사는 우리 어휘가 아니라 사전 전체(기초사전)로 판정한다.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from korean_form import adnominal, _split, _join, JONG

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"

ADJ, NOUN, VERB, ADV = "형용사", "명사", "동사", "부사"


def load_pos():
    return {k: set(v) for k, v in json.loads((OUT / "dict-pos.json").read_text(encoding="utf-8")).items()}


def resolve(bundle, edits):
    final = {r["head"]: list(r["terms"]) for r in bundle["rows"]}
    for e in edits:
        t = final.get(e["head"])
        if t is None or e["action"] == "note":
            continue
        at = t.index(e["term"]) if e["term"] in t else -1
        if e["action"] == "drop" and at >= 0:
            t.pop(at)
        elif e["action"] == "add" and at < 0:
            t.append(e["term"])
        elif e["action"] == "rename" and e.get("to"):
            if at >= 0:
                t[at] = e["to"]
            elif e["to"] not in t:
                t.append(e["to"])
    return final


def add_m(stem):
    """어간을 명사형(-ㅁ/-음)으로. 외롭 → 외로움, 기쁘 → 기쁨."""
    parts = _split(stem[-1])
    if parts is None:
        return stem + "음"
    cho, jung, jong = parts
    tail = JONG[jong]
    if tail == "_":
        return stem[:-1] + _join(cho, jung, JONG.index("ㅁ"))
    if tail == "ㅂ":
        return stem[:-1] + _join(cho, jung, 0) + "움"
    return stem + "음"


def with_b(ch):
    """가벼 → 가볍 : ㅂ불규칙 부사(가벼이)의 어간을 되살린다."""
    parts = _split(ch)
    if parts is None or JONG[parts[2]] != "_":
        return None
    return _join(parts[0], parts[1], JONG.index("ㅂ"))


class Lexicon:
    def __init__(self, pos):
        self.pos = pos
        self.adj_form = {}            # 관형형 → 형용사 사전형
        self.verb_form = defaultdict(set)
        self.nominal = {}             # 명사형 → 형용사 사전형
        for word, p in pos.items():
            if not word.endswith("다") or len(word) < 2:
                continue
            if ADJ in p:
                self.adj_form.setdefault(adnominal(word, verb=False), word)
                self.nominal.setdefault(add_m(word[:-1]), word)
            if VERB in p:
                self.verb_form[adnominal(word, verb=True)].add(word)
                self.verb_form[adnominal(word, verb=False)].add(word)   # 과거 관형형(화난·걱정한)

    def is_(self, word, kind):
        return kind in self.pos.get(word, ())

    def kind(self, term):
        """검색어 하나의 판정. ok 면 그대로 둔다."""
        if " " in term:
            return "phrase"
        if term in self.adj_form:
            return "adj"
        if term.endswith("적인") and (self.is_(term[:-1], NOUN) or self.is_(term[:-1], "관형사")):
            return "adj"                                  # 감성적인·몽환적인 — 관형격이라 형용사로 친다
        if self.is_(term, "관형사"):
            return "adj"
        if term in self.nominal and self.is_(term, NOUN):
            return "nominal"                              # 외로움 — 형용사로 되돌릴 대상
        if self.is_(term, NOUN) or self.is_(term, "의존 명사"):
            if self.is_(term + "하다", ADJ):
                return "sino"                             # 평온 — 평온한 이 있다
            return "noun"
        if term in self.verb_form:
            return "verb"
        if self.is_(term, ADV):
            return "adv"
        return "unknown"

    def adjective_for(self, term, kind):
        """같은 뿌리의 형용사 사전형을 찾는다. 못 찾으면 None."""
        cands = []
        if kind == "nominal":
            cands.append(self.nominal[term])
        if kind == "sino":
            cands.append(term + "하다")
        if kind == "verb":
            for lemma in self.verb_form[term]:
                root = re.sub(r"(거리다|대다|이다|하다|되다|나다|어하다|워하다)$", "", lemma)
                if root and root != lemma:
                    cands += [root + "스럽다", root + "롭다", root + root + "하다", root + "하다"]
                if lemma.endswith("워하다"):                 # 즐거워하다 → 즐겁다
                    b = with_b(lemma[-4])
                    if b:
                        cands.append(lemma[:-4] + b + "다")
                if lemma.endswith(("어하다", "아하다", "여하다", "퍼하다")):   # 슬퍼하다 → 슬프다
                    cands.append(lemma[:-3] + "다")
        if kind == "adv":
            if term.endswith("스레"):
                cands.append(term[:-2] + "스럽다")
            if term.endswith("로이"):
                cands.append(term[:-2] + "롭다")
            if term.endswith(("히", "이")):
                cands += [term[:-1] + "하다", term[:-1] + "다"]
                b = with_b(term[-2]) if len(term) > 2 else None
                if b:
                    cands.append(term[:-2] + b + "다")      # 가벼이 → 가볍다
            cands += [term + "하다"]                        # 반짝반짝 → 반짝반짝하다
            if len(term) >= 2 and len(term) % 2 == 0 and term[: len(term) // 2] * 2 != term:
                cands.append(term + term + "하다")           # 둥실 → 둥실둥실하다
        for c in cands:
            if self.is_(c, ADJ):
                return c
        return None

    def noun_for(self, term, kind):
        if kind == "verb":
            for lemma in self.verb_form[term]:
                root = re.sub(r"(하다|되다)$", "", lemma)
                if root != lemma and self.is_(root, NOUN) and len(root) >= 2:
                    return root
        return None


# 그대로 두는 판정. 동사 관형형과 사람이 1차에서 승인한 구(맑게 갠)도 여기 든다.
KEEP = ("adj", "noun", "verb", "phrase")

# 같은 소리의 다른 형용사로 붙는 것 — 원래 말 그대로 둔다(2026-09-19 검수).
#   수상(물 위)→수상한(의심스럽다), 무색(빛깔 없음)→무색한(부끄럽다), 강(강물)→강한 …
HOMONYM = {"강", "결", "자세", "이상", "털털", "똑똑", "뚝뚝", "툭툭", "딱딱", "땡땡", "팍팍", "훌쩍",
           "싹싹", "척척", "껄껄", "덩실", "톡톡", "팔팔", "휘휘", "면면", "들썩", "수상", "무색",
           "미련", "멍멍", "쌩쌩", "빡빡", "고급", "혼돈", "수선"}
# 기초사전에는 없지만 맞는 말.
KNOWN = {"설렘", "점무늬", "말없는", "빼꼼한", "샘솟는"}


def plan(bundle, edits, lex):
    final = resolve(bundle, edits)
    rows = []
    for head, terms in final.items():
        keep = [t for t in terms if lex.kind(t) in KEEP]
        for t in terms:
            kind = lex.kind(t)
            if kind in KEEP or t in HOMONYM or t in KNOWN:
                continue
            if kind == "unknown":
                rows.append((head, t, kind, "manual", "", "사전에 없는 꼴 — 사람이 본다"))
                continue
            adj = lex.adjective_for(t, kind)
            if not adj:
                continue                                     # 짝이 없으면 원래 말 그대로
            target = adnominal(adj, verb=False)
            if target in keep and target != t:
                rows.append((head, t, kind, "drop", target, f"'{target}' 이 이미 있다"))
            else:
                rows.append((head, t, kind, "rename", target, f"형용사 {adj}"))
                keep.append(target)
    return final, rows


def main():
    lex = Lexicon(load_pos())
    bundle = json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))
    edits = [json.loads(l) for l in (EMBED / "mood-edits" / "term-edits.jsonl")
             .read_text(encoding="utf-8").splitlines() if l.strip()]
    final, rows = plan(bundle, edits, lex)
    out = OUT / "term-finalize-plan.tsv"
    out.write_text("묶음\t검색어\t판정\t처리\t바꿀 꼴\t이유\n"
                   + "\n".join("\t".join(r) for r in rows) + "\n", encoding="utf-8")
    from collections import Counter
    print(json.dumps({"terms": sum(len(t) for t in final.values()), "to_fix": len(rows),
                      "by_kind": Counter(r[2] for r in rows),
                      "by_action": Counter(r[3] for r in rows)}, ensure_ascii=False, default=dict))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

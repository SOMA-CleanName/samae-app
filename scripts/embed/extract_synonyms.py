"""사전이 적어 둔 비슷한 말 · 반대말 뽑기 — 묶음(D2) 후보용 (docs/40 §17-5, 2026-09-22).

뜻풀이 벡터로는 같은 묶음 짝을 절반도 못 찾는다(상위 15 이웃 안에 49%) — 뜻이 여러 개인 긴 뜻풀이가 벡터를 흐린다.
사전이 직접 "비슷한말" 이라고 이어 둔 것을 후보의 뼈대로 쓴다. 반대말은 잇지 않도록 막는 데 쓴다(§16-2).

  우리말샘  relation_info type 비슷한말 · 반대말 (뜻 하나에 달린다)
  기초사전  SenseRelation type 유의어 · 반의어

표제어의 붙임표 · 어깨번호(가나다-순001)는 지운다. 검색어 판정은 낱말 단위라 뜻 번호는 버린다 — 뜻이 갈리는지는 판정에서 본다.
출력: out/mood-vocabulary/synonyms.jsonl — {a, b, type: 비슷한말|반대말}
"""
import json
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
OPENDICT = OUT / "opendict-42c0d01889f34536e9cf94fe57f62bd2055b1bde"
KRDICT = sorted(OUT.glob("42c0d01889f34536e9cf94fe57f62bd2055b1bde-*.xml"))
ITEM = re.compile(r"<item>(.*?)</item>", re.S)
WORD = re.compile(r"<wordInfo>\s*<word><!\[CDATA\[(.*?)\]\]></word>", re.S)
REL = re.compile(r"<relation_info>\s*<word><!\[CDATA\[(.*?)\]\]></word>\s*<type>(비슷한말|반대말)</type>", re.S)
LEX = re.compile(r"<LexicalEntry.*?</LexicalEntry>", re.S)
LEMMA = re.compile(r'<Lemma>\s*<feat att="writtenForm" val="([^"]*)"')
RELF = re.compile(r'<SenseRelation>\s*<feat att="type" val="([^"]*)" />.*?<feat att="lemma" val="([^"]*)"', re.S)
KIND = {"비슷한말": "비슷한말", "반대말": "반대말", "유의어": "비슷한말", "반의어": "반대말"}


def clean(w):
    return re.sub(r"\d+$", "", w.replace("-", "").replace("^", " ")).strip()


def main():
    pairs = set()
    for f in sorted(OPENDICT.glob("*.xml")):
        text = f.read_text(encoding="utf-8")
        for item in ITEM.findall(text):
            m = WORD.search(item)
            if not m:
                continue
            a = clean(m.group(1))
            for b, t in REL.findall(item):
                b = clean(b)
                if a and b and a != b:
                    pairs.add((a, b, KIND[t]))
        print(f"  {f.name}: {len(pairs)}", flush=True)
    for f in KRDICT:                                   # 깨진 곳이 있어 XML 파서 대신 글자로 읽는다
        text = f.read_text(encoding="utf-8")
        for entry in LEX.findall(text):
            m = LEMMA.search(entry)
            if not m:
                continue
            a = clean(m.group(1))
            for t, b in RELF.findall(entry):
                b = clean(b)
                if t in KIND and a and b and a != b:
                    pairs.add((a, b, KIND[t]))
        print(f"  {f.name}: {len(pairs)}", flush=True)
    with (OUT / "synonyms.jsonl").open("w", encoding="utf-8") as f:
        for a, b, t in sorted(pairs):
            f.write(json.dumps({"a": a, "b": b, "type": t}, ensure_ascii=False) + "\n")
    print(len(pairs))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

"""우리말샘 → 무드 후보 풀 (docs/40 §17, 2026-09-22).

한국어기초사전만으로는 신조어 · 외래어 · 구절이 빠졌다(힙한 · 꾸안꾸 · 윤슬). 우리말샘(국립국어원 개방 사전)은
표제어 97만여 개에 그런 말이 대부분 들어 있고 뜻풀이도 있어, 기초사전과 같은 방식으로 무드 판정을 할 수 있다.

입력: out/mood-vocabulary/opendict-<커밋>/*.xml — GitHub 미러 spellcheck-ko/korean-dict-nikl 의 opendict 를
      커밋에 고정해 받은 것(기초사전과 같은 커밋). CC BY-SA 2.0 KR. **예문은 읽지 않는다** — 출판물·신문 인용이라 재배포 불가.
출력: out/mood-vocabulary/opendict-pool.jsonl — 표제어 하나에 한 줄, 살아남은 뜻만.

확실히 아닌 것을 뺀다(뜻 단위):
  - 일반어가 아닌 뜻(옛말 · 방언 · 북한어)
  - 속담, 어미 · 조사 · 접사 · 의존 명사 · 대명사 · 수사
  - 전문 분야에만 속한 뜻(의학 · 화학 · 법률 · 지명 · 인명 …). 분야가 비었거나 사진·무드와 이어질 수 있는 분야
    (영상 · 미술 · 복식 · 식물 · 천문 · 지구 …)가 하나라도 있으면 남긴다. 신조어는 대개 분야가 비어 있다(힙하다 · 갬성 · 윤슬)
뜻이 하나도 안 남은 표제어는 뺀다. 이미 판정한 11,578개에는 판정(mood / not_mood)을 붙여 둔다 — 다음 단계의 정답 표본이다.
"""
import glob
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out" / "mood-vocabulary"
SRC = OUT / "opendict-42c0d01889f34536e9cf94fe57f62bd2055b1bde"
POOL = OUT / "opendict-pool.jsonl"

DROP_POS = {"어미", "조사", "접사", "의존 명사", "대명사", "수사", "수·관", "수·명", "대·관", "대·부"}
# 사진·무드와 무관한 전문 분야. 여기에'만' 속한 뜻을 뺀다
DROP_CATS = {
    "의학", "정보·통신", "지명", "역사", "경제", "전기·전자", "생명", "건설", "체육", "법률", "화학", "교육", "물리",
    "인명", "기계", "불교", "군사", "농업", "동물", "수학", "행정", "경영", "교통", "정치", "언어", "책명", "한의",
    "약학", "공업", "공학 일반", "철학", "광업", "임업", "수의", "보건 일반", "가톨릭", "기독교", "산업 일반",
    "종교 일반", "재료", "천연자원", "고유명 일반", "수산업", "복지",
}


def clean_word(raw):
    """^ 는 띄어쓰기, - 는 형태소 경계, 숫자는 동음이의 번호다."""
    return re.sub(r"\d", "", raw.replace("^", " ").replace("-", "")).strip()


def keep_sense(stype, pos, cats):
    if stype != "일반어" or pos in DROP_POS:
        return False
    return not cats or any(c not in DROP_CATS for c in cats)


def extract(paths, judged):
    words, funnel = {}, Counter()
    for path in paths:
        for _, n in ET.iterparse(path, events=("end",)):
            if n.tag != "item":
                continue
            funnel["뜻"] += 1
            raw = n.findtext("wordInfo/word") or ""
            unit = n.findtext("wordInfo/word_unit") or ""
            stype = n.findtext("senseInfo/type") or ""
            pos = n.findtext("senseInfo/pos") or ""
            cats = [c.text for c in n.findall("senseInfo/cat_info/cat") if c.text]
            word = clean_word(raw)
            if raw.startswith("-") or raw.endswith("-") or unit == "속담" or not word:
                funnel["속담·접사 등"] += 1
            elif not keep_sense(stype, pos, cats):
                funnel["걸러진 뜻"] += 1
            else:
                entry = words.setdefault(word, {"word": word, "units": [], "word_types": [], "senses": []})
                for key, value in (("units", unit), ("word_types", n.findtext("wordInfo/word_type") or "")):
                    if value and value not in entry[key]:
                        entry[key].append(value)
                entry["senses"].append({"pos": pos, "cats": cats,
                                        "definition": " ".join((n.findtext("senseInfo/definition") or "").split())})
            n.clear()
    for word, entry in words.items():
        if word in judged:
            entry["judged"] = judged[word]
    return words, funnel


def main():
    screening = json.loads((OUT / "screening-screen-priority.json").read_text(encoding="utf-8"))["rows"]
    judged = {r["label"]: r["verdict"] for r in screening}
    words, funnel = extract(sorted(glob.glob(str(SRC / "*.xml"))), judged)
    with POOL.open("w", encoding="utf-8") as f:
        for entry in words.values():
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    pos = Counter(p for e in words.values() for p in {s["pos"] or "(구)" for s in e["senses"]})
    print(json.dumps({**funnel, "남은 표제어": len(words), "이미 판정": sum(1 for e in words.values() if "judged" in e),
                      "외래어·혼종어 포함": sum(1 for e in words.values() if {"외래어", "혼종어"} & set(e["word_types"])),
                      "구·관용구": sum(1 for e in words.values() if set(e["units"]) - {"어휘"}),
                      "품사(표제어 기준)": pos.most_common(10)}, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

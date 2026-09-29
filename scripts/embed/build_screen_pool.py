"""무드 판정 풀 — 임베딩할 문장 만들기 (docs/40 §17, 2026-09-22).

master-words.jsonl(중복 없앤 37.8만)에서 판정할 낱말을 고르고, 낱말마다 임베딩할 문장 한 줄을 만든다.

  빼는 것
    - 다른 표기로 연결된 낱말(same_as) — 기준 표기 하나만 본다
    - 감성사전에만 있는 낱말 — 대부분 뜻풀이 조각·이모티콘이고, 온전한 낱말은 사전에 이미 있다(사람 결정)
    - **1단계 규칙: 확실히 무드가 아닌 것** — 수식어(형용사·부사…)가 하나도 없고, 모든 뜻풀이가
      "~하는 사람 / ~의 하나 / 기관 / 화합물 / 질병 / 장치 / 제도 / 단위 / 직위" 같은 대상으로 끝나는 우리말샘 낱말.
      "또는" 이 들어간 뜻풀이는 건드리지 않는다(주먹코 — "…코. 또는 그런 코를 가진 사람").
      정답 표본(이미 판정한 11,374개)에 대 보니 무드 5,145개 중 1개만 잃었다(덜렁이).

  문장
    기초사전에 있으면 기초사전 뜻풀이가 우선(뜻풀이가 짧고 명확하다, §17), 없으면 우리말샘 뜻풀이.
    관형형이 기준인 낱말(힙한 · 강렬한)은 연결된 사전형(힙하다 · 강렬하다)의 뜻풀이를 쓴다 — 뜻풀이는 사전형에 붙어 있다.
    사전에 없는 표현(파스텔톤 · 필름 감성)은 에이전트가 적은 용례, 검증 후보는 영어 설명.
    "낱말: 뜻1 / 뜻2 …" — 너무 길면 자른다.

결과: out/mood-vocabulary/screen-pool.jsonl — {word, text, sources, judged?}
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
POOL = OUT / "screen-pool.jsonl"
MAX_TEXT = 600   # 300 이면 뜻이 많은 낱말 615개가 잘렸다

MOD_POS = {"형용사", "부사", "관형사", "관·명", "감탄사"}
END = r"\.?\s*$"
NOT = [
    ("사람", re.compile(r"(하는|한|된|있는|없는|가진|맡은|받은|난|든|인|는|은|던|하던) 사람" + END)),
    ("종류", re.compile(r"의 (하나|한 종류|일종|총칭)" + END)),
    ("기관·단체", re.compile(r"(기관|단체|회사|협회|학회|학교|병원|시설|부서|조직체|정당|위원회|협의회|연구소|공사|공단)" + END)),
    ("물질", re.compile(r"(화합물|원소|물질|성분|효소|호르몬|단백질|세포|용액|합금|광물|약품|약제|의약품|시약)" + END)),
    ("질병", re.compile(r"(병|질환|질병|증상|증후군|감염증|염증|종양|장애)" + END)),
    ("방법·제도", re.compile(r"(방법|기술|기법|공법|제도|법률|법규|규칙|규정|조약|협약|이론|학설|학문|학파|정책)" + END)),
    ("장치", re.compile(r"(장치|기계|기구|도구|설비|부품|장비|기기|시스템|프로그램|소프트웨어)" + END)),
    ("문서·작품", re.compile(r"(문서|서류|증서|잡지|신문|교과서|논문|법전|경전|음반|앨범|드라마|방송 프로그램)" + END)),
    ("단위·돈", re.compile(r"(단위|비용|요금|세금|금액|수치|지표|지수|비율|이자|자금|자본)" + END)),
    ("직위", re.compile(r"(직업|직위|관직|벼슬|계급|직책|관리|공무원|군인|장교)" + END)),
]


def certainly_not(senses):
    """모든 뜻이 '확실히 무드 아님' 패턴이면 그 이유. 수식어가 하나라도 있거나 '또는' 이 있으면 None."""
    if not senses or any(s["pos"] in MOD_POS for s in senses):
        return None
    reason = None
    for s in senses:
        if "또는" in s["definition"]:
            return None
        hit = next((name for name, rx in NOT if rx.search(s["definition"])), None)
        if not hit:
            return None
        reason = reason or hit
    return reason


# 감성사전에만 있는 것 중 대부분은 뜻풀이 조각(가난에 · 걱정스럽거나 · 보드랍고 야들야들한)이지만,
# 사전에 없는 신조어 · 구어(존예 · 트렌디하다 · 뾰루퉁하다 · 흥글벙글)가 363개 섞여 있다 — 그것은 판정에 넣는다
FRAG = re.compile(r"(이|가|을|를|에|에게|의|와|과|나|이나|으로|로|도|은|는|만|라는|이라는|처럼|거나|며|면서|면서도|아서|어서|여서|서|"
                  r"도록|려|려고|고자|느라고|기는|기|하기|할|울|ㄹ|아|어|여|져|워|해|고)$")
INFLECT = [("적인", "적"), ("적으로", "적"), ("적이고", "적"), ("적이다", "적"), ("하게", "하다"), ("하고", "하다"), ("하여", "하다"),
           ("해", "하다"), ("함", "하다"), ("하며", "하다"), ("할", "하다"), ("한", "하다"), ("히", "하다"), ("스럽게", "스럽다"),
           ("스러움", "스럽다"), ("롭게", "롭다"), ("로움", "롭다"), ("이다", ""), ("게", "다"), ("고", "다"), ("음", "다"),
           ("는", "다"), ("은", "다"), ("을", "다"), ("던", "다"), ("지", "다"), ("어", "다"), ("아", "다")]


def knu_word(w, words):
    """감성사전에만 있는 말 중 온전한 한 낱말 — 띄어 쓴 구절 · 조각 · 사전 낱말의 활용형(미안하게 → 미안하다)이 아닌 것."""
    if " " in w or not re.fullmatch(r"[가-힣]{2,}", w) or FRAG.search(w):
        return False
    for end, base in INFLECT:
        if w.endswith(end) and len(w) > len(end) and ({"opendict", "krdict"} & words.get(w[:-len(end)] + base, set())):
            return False
    return True


# 뜻풀이가 다른 말만 가리키면('가느다랗다'의 준말 · '한글'을 달리 이르는 말) 뜻은 그 말에 있다 — 그 말의 뜻풀이를 붙인다
REF = re.compile(r"[‘'「]([^’'」]+)[’'」]")
REF_END = re.compile(r"(준말|본말|원말|같은 말|잘못|비슷한 말|높임말|낮춤말|달리 이르는 말|방언|옛말|큰말|작은말|센말|여린말|거센말|변한 말)\.?\s*$")


def resolve(definitions, lookup):
    out = list(definitions)
    for d in definitions:
        if len(d) < 40 and REF_END.search(d) or d.lstrip().startswith("→"):
            for ref in REF.findall(d) or [d.lstrip("→ ").strip()]:
                ref = re.sub(r"[\d^\-]", "", ref).strip()
                out += lookup(ref)[:3]
    return out


def text_of(word, definitions):
    body = " / ".join(dict.fromkeys(d for d in definitions if d))
    line = f"{word}: {body}" if body else word
    return line if len(line) <= MAX_TEXT else line[:MAX_TEXT]


def main():
    master = [json.loads(l) for l in (OUT / "master-words.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    opendict = {}
    for line in (OUT / "opendict-pool.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            e = json.loads(line)
            opendict[e["word"]] = e
    krdict = {}
    for entries in json.loads((OUT / "senses.json").read_text(encoding="utf-8"))["entries"].values():
        for e in entries:
            krdict.setdefault(" ".join(e["label"].split()), []).extend(s["definition"] for s in e["senses"])
    usage = {}
    for line in (EMBED / "mood-edits" / "additions-generated.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            g = json.loads(line)
            usage.setdefault(" ".join(g["label"].split()), g.get("usage", ""))
    collection = json.loads((OUT / "collection.json").read_text(encoding="utf-8"))
    prompt = {" ".join(c["label"].split()): c.get("english_prompt", "") for c in collection["candidates"]
              if c.get("selection_status") == "shortlisted"}
    screening = json.loads((OUT / "screening-screen-priority.json").read_text(encoding="utf-8"))["rows"]
    judged = {r["label"]: r["verdict"] for r in screening}
    # 기준이 바뀌어(2026-09-23, 사람 결정) 능력 · 인격 · 가치 판단 · 꾸밈도 무드다 — 옛 판정 파일은 그대로 두고 여기서 덧씌운다
    override = EMBED / "mood-edits" / "rejudge-value.jsonl"
    if override.exists():
        for line in override.read_text(encoding="utf-8").splitlines():
            if line.strip():
                o = json.loads(line)
                judged[o["word"]] = o["verdict"]

    # 기준 표기가 감성사전에만 있어도(따뜻한), 연결된 사전형(따뜻하다)이 사전에 있으면 사전 출처로 본다.
    # 이걸 빠뜨려 가장 흔한 형용사 714개(따뜻한 · 예쁜 · 귀여운 …)가 통째로 빠졌었다(2026-09-23 고침)
    linked = {}
    for row in master:
        if "same_as" in row:
            linked.setdefault(row["same_as"], set()).update(row["sources"])
    words = {r["word"]: set(r["sources"]) | linked.get(r["word"], set()) for r in master}
    glosses = {}
    for line in (EMBED / "mood-edits" / "glosses-ai.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            g = json.loads(line)
            if g.get("gloss"):
                glosses[g["word"]] = g["gloss"]
    lookup = lambda w: krdict.get(w) or [s["definition"] for s in opendict.get(w, {}).get("senses", [])]
    resolved = 0
    kept, dropped = [], Counter()
    for row in master:
        w = row["word"]
        src = set(row["sources"]) | linked.get(w, set())
        if "same_as" in row:
            dropped["다른 표기로 연결"] += 1
            continue
        if w.startswith("-") or re.search(r"[ᄀ-ᇿ㄰-㆏]", w):   # -ㄴ 것 같다 같은 문법 조각
            dropped["문법 조각"] += 1
            continue
        if src == {"knu"} and not knu_word(w, words):
            dropped["감성사전에만 있음 · 조각"] += 1
            continue
        lemmas = row.get("lemmas", [])
        if w in krdict or any(l in krdict for l in lemmas):
            defs = krdict.get(w, []) + [d for l in lemmas for d in krdict.get(l, [])]
        elif w not in opendict and any(l in opendict for l in lemmas):
            defs = [s["definition"] for l in lemmas for s in opendict.get(l, {}).get("senses", [])]
        elif w in opendict:
            reason = certainly_not(opendict[w]["senses"])
            if reason:
                dropped[f"확실히 아님 · {reason}"] += 1
                continue
            defs = [s["definition"] for s in opendict[w]["senses"]]
        elif w in usage:
            defs = [usage[w]]
        elif w in prompt:
            defs = [prompt[w]]
        else:
            defs = []
        if not defs and w in glosses:           # 사전에 뜻풀이가 없는 신조어 · 활용형 — 에이전트가 쓴 사전식 뜻풀이
            defs = [glosses[w]]
        full = resolve(defs, lookup)
        resolved += len(full) > len(defs)
        item = {"word": w, "text": text_of(w, full), "sources": sorted(src)}
        verdicts = [judged[x] for x in [w, *lemmas] if x in judged]
        if verdicts:                            # 판정은 사전형(강렬하다)에 붙어 있다 — 관형형이 물려받는다
            item["judged"] = "mood" if "mood" in verdicts else verdicts[0]
        kept.append(item)
    with POOL.open("w", encoding="utf-8") as f:
        for item in kept:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(json.dumps({"기준 낱말": sum(1 for r in master if "same_as" not in r), "판정 풀": len(kept),
                      "뺀 것": dict(dropped.most_common()), "정답 표본": sum(1 for k in kept if "judged" in k),
                      "뜻풀이 없는 것": sum(1 for k in kept if ":" not in k["text"]),
                      "가리키는 말의 뜻풀이를 붙인 것": resolved}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

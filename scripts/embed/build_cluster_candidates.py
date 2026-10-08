"""무리(D3) — 거의 같은 묶음끼리 묶을 후보를 만든다 (docs/40 §16, 2026-09-21).

이웃에는 두 종류가 섞여 있다. 거의 같은 것(깜박이는 · 껌벅이는, 주황 · 주황색)과 결이 비슷한 것
(깜박이는 · 번쩍이는). 앞의 것을 묶음(D2)으로 합치려 했으나, 합치기는 되돌리기 어렵고 경계도 미묘했다.
그래서 **묶음은 그대로 두고 그 위에 "거의 같은 것" 의 층을 하나 둔다** — 무리. 틀리면 무리에서 빼면 된다.

무리는 사람이 확정한다. 다만 721곳을 다 보기엔 많아서 에이전트가 1차로 가른다 — 확실히 무리(group),
확실히 아님(keep), 애매함(unsure). 사람은 애매함만 보고, 나머지는 훑어보다 뒤집으면 된다. 사람 판정이 늘 우선이다.
qwen3:14b 는 "같은" 과 "비슷한" 을 못 갈랐고(조용한 = 평온한), 에이전트도 한 번 빤짝한(정신 차림)을
반짝이는 의 소리 변형으로 잘못 봤다 — 그래서 1차 검수는 축과 뜻풀이를 대조하게 했고, 확신이 없으면 넘기게 했다.
유사도만으로도 안 된다 — 깜박이는 · 껌벅이는 은 0.667 이라 0.7 선에 못 미치고, 선을 낮추면
어수선한(장면) 과 착잡한(마음) 이 섞인다. 그래서 후보를 두 갈래로 뽑는다.

  root    검색어의 어미(-한 · -감 · -이는 …)를 떼고 된소리·모음 짝(ㄲ→ㄱ, ㅓ→ㅏ)을 맞춘 뿌리가
          서로 다른 묶음에서 겹치는 곳. 소리 변형과 꼴만 다른 것을 잡는다
  similar 이웃 그래프에서 **서로 고른** 간선 중 유사도가 0.75 이상인데 root 에 없는 쌍.
          뿌리가 달라 규칙이 못 잡는 거의 같은 말(주황 = 주황색, 백색 = 흰색, 시새움 = 시샘)

결과: mood-edits/cluster-candidates.json. 검수는 /admin/photo-purpose/mood/cluster,
무리 층 만들기는 build_mood_clusters.py.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

EMBED = Path(__file__).resolve().parent
EDITS = EMBED / "mood-edits"
OUT = EDITS / "cluster-candidates.json"
AI = EDITS / "cluster-ai.jsonl"                 # 에이전트 1차 검수 — 있으면 후보에 붙인다
SIMILAR = 0.75

SUFFIX = sorted(["스러운", "스레", "로운", "롭다", "적인", "거리는", "대는", "이는", "하는", "되는", "된", "한",
                 "적", "감", "심", "히", "이", "은", "는", "운", "진", "난", "해진", "스럽다", "하다", "대다", "거리다", "이다"],
                key=len, reverse=True)
CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
CHO_MAP = {"ㄲ": "ㄱ", "ㅋ": "ㄱ", "ㄸ": "ㄷ", "ㅌ": "ㄷ", "ㅃ": "ㅂ", "ㅍ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ", "ㅊ": "ㅈ"}
JUNG_MAP = {"ㅓ": "ㅏ", "ㅜ": "ㅗ", "ㅔ": "ㅐ", "ㅕ": "ㅑ", "ㅠ": "ㅛ", "ㅝ": "ㅘ", "ㅟ": "ㅚ", "ㅡ": "ㅏ", "ㅞ": "ㅙ"}


def soften(word):
    """된소리·거센소리는 예사소리로, 음성 모음은 양성 모음으로 — 깜박 · 껌벅 · 끔벅 이 한 뿌리가 된다."""
    out = []
    for ch in word:
        code = ord(ch) - 0xAC00
        if 0 <= code < 11172:
            cho, jung, jong = code // 588, (code % 588) // 28, code % 28
            c = CHO.index(CHO_MAP.get(CHO[cho], CHO[cho]))
            j = JUNG.index(JUNG_MAP.get(JUNG[jung], JUNG[jung]))
            out.append(chr(0xAC00 + c * 588 + j * 28 + jong))
        else:
            out.append(ch)
    return "".join(out)


def root(term):
    t = term.replace(" ", "")
    for s in SUFFIX:
        if t.endswith(s) and len(t) - len(s) >= 2:
            t = t[: -len(s)]
            break
    if len(t) % 2 == 0 and len(t) >= 4 and t[: len(t) // 2] == t[len(t) // 2:]:
        t = t[: len(t) // 2]                    # 첩어는 반으로 (깜박깜박 → 깜박)
    return soften(t)


def gloss(row, term, senses):
    for w in [w for w, t in row["aliases"].items() if t == term] + [term]:
        first = ((senses.get(w) or {}).get("senses") or [""])[0]
        if first:
            return first[:60]
    return ""


def build(rows, edges, senses, hints):
    R = {r["head"]: r for r in rows}

    def group(h, key=None):
        # key 가 있으면 그 뿌리로 걸린 검색어에 hit 표시 — 화면이 "왜 모였는지" 를 보여 준다
        r = R[h]
        return {"head": h, "label": r["terms"][0], "axes": r["axes"], "usage": r["usage"],
                "terms": [{"term": t, "gloss": gloss(r, t, senses), **({"hit": True} if key and root(t) == key else {})}
                          for t in r["terms"]]}

    by_root = defaultdict(set)
    for r in rows:
        for t in r["terms"]:
            k = root(t)
            if len(k) >= 2:
                by_root[k].add(r["head"])
    cases, covered = [], set()
    for k, heads in sorted(by_root.items()):
        if len(heads) < 2:
            continue
        hs = sorted(heads)
        covered |= {(a, b) for a in hs for b in hs if a < b}
        cases.append({"id": f"r{len(cases) + 1:03d}", "kind": "root", "reason": f"글자가 비슷해서 모인 후보 ({k})",
                      "groups": [group(h, k) for h in hs]})
    similar = sorted((e for e in edges if e["state"] == "mutual" and e["score"] >= SIMILAR
                      and tuple(sorted((e["a"], e["b"]))) not in covered), key=lambda e: -e["score"])
    for n, e in enumerate(similar, 1):
        cases.append({"id": f"s{n:03d}", "kind": "similar", "reason": f"이웃 그래프에서 서로 고른 쌍 · 유사도 {e['score']:.2f}",
                      "groups": [group(e["a"]), group(e["b"])]})
    for case in cases:
        ai = hints.get(frozenset(g["head"] for g in case["groups"]))
        if ai:
            case["ai"] = ai
    return cases


def load_hints():
    """에이전트 1차 검수(묶음 조합 → 판정). 후보 번호가 아니라 묶음 조합으로 맞춘다 — 번호는 다시 만들면 바뀐다."""
    if not AI.exists():
        return {}
    out = {}
    for line in AI.read_text(encoding="utf-8").splitlines():
        if line.strip():
            j = json.loads(line)
            out[frozenset(j["heads"])] = {k: j[k] for k in ("verdict", "members", "why") if k in j}
    return out


def main():
    rows = json.loads((EMBED / "mood-terms-bundle.json").read_text(encoding="utf-8"))["rows"]
    edges = json.loads((EMBED / "mood-neighbors-bundle.json").read_text(encoding="utf-8"))["edges"]
    senses = json.loads((EMBED / "mood-review-bundle.json").read_text(encoding="utf-8"))["senses"]
    cases = build(rows, edges, senses, load_hints())
    OUT.write_text(json.dumps({"cases": cases}, ensure_ascii=False), encoding="utf-8")
    kinds = defaultdict(int)
    for c in cases:
        kinds[c["kind"]] += 1
    ai = defaultdict(int)
    for c in cases:
        ai[c.get("ai", {}).get("verdict", "none")] += 1
    print(json.dumps({"cases": len(cases), **kinds, "ai": ai}, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

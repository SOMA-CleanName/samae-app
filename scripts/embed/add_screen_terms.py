"""새로 판정한 무드를 검색어 번들에 묶음으로 더하기 (docs/40 §17-3, 2026-09-23).

사전 거르기(merge_screen_judgments.py)에서 무드로 판정한 낱말과, 옛 판정을 새 기준으로 뒤집어 무드가 된 낱말 중
검색어 번들(mood-terms-bundle.json)에 아직 없는 것을 한 낱말 = 한 묶음으로 뒤에 붙인다.

  - 기존 묶음은 건드리지 않는다 — 흡수 · 이동 · 수정 없음(층 쌓기 원칙). 이미 어느 묶음의 대표 · 검색어 · 별칭이면 건너뛴다
  - 축은 비워 둔다(axes: []) — 축 배정은 다음 단계. 화면의 "축 없음" 칸에서 본다
  - 검색 꼴은 관형형(고즈넉하다 → 고즈넉한, 반짝이다 → 반짝이는). 대표(head)는 사전 꼴 그대로
  - usage 는 뜻풀이 첫 뜻(짧게). added · sure 로 새로 들어온 것과 애매 표시를 남긴다

원본은 out/mood-vocabulary/mood-terms-bundle.before-add.json 으로 한 번만 남긴다. 다시 돌려도 결과가 같다(원본에서 다시 만든다).
"""
import json
import shutil
import sys
from pathlib import Path

import korean_form

EMBED = Path(__file__).resolve().parent
OUT = EMBED / "out" / "mood-vocabulary"
BUNDLE = EMBED / "mood-terms-bundle.json"
BEFORE = OUT / "mood-terms-bundle.before-add.json"
ADDED = "2026-09-23"


def search_form(word, pos):
    """-다 로 끝나는 용언은 관형형으로. 형용사면 -ㄴ, 동사면 -는. 모르면 그대로."""
    if not word.endswith("다") or " " in word:
        return word
    for verb in ([False] if "형용사" in pos else [True] if "동사" in pos else []):
        try:
            form = korean_form.adnominal(word, verb=verb)
        except Exception:
            form = None
        if form and form != word:
            return form
    return word


def main():
    if not BEFORE.exists():
        shutil.copyfile(BUNDLE, BEFORE)
    bundle = json.loads(BEFORE.read_text(encoding="utf-8"))
    rows = [r for r in bundle["rows"] if not r.get("added")]
    known = set()
    for r in rows:
        known.add(r["head"])
        known.update(r["terms"])
        known.update(r["aliases"])

    pool = {}
    for line in (OUT / "screen-pool.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            p = json.loads(line)
            pool[p["word"]] = p
    pos = {}
    for line in (OUT / "opendict-pool.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            e = json.loads(line)
            pos[e["word"]] = {s["pos"] for s in e["senses"]}
    for entries in json.loads((OUT / "senses.json").read_text(encoding="utf-8"))["entries"].values():
        for e in entries:
            pos.setdefault(" ".join(e["label"].split()), set()).add(e["metadata"].get("partOfSpeech"))

    # 새로 무드가 된 것: 사전 후보 판정(Y) + 옛 판정 중 무드인데 번들에 없는 것(뒤집힌 것 포함)
    judged = [json.loads(l) for l in (EMBED / "mood-edits" / "screen-judged.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    fresh = [(j["word"], j["sure"]) for j in judged if j["v"] == "Y"]
    fresh += [(w, True) for w, p in pool.items() if p.get("judged") == "mood"]

    added, skipped = [], 0
    for word, sure in fresh:
        term = search_form(word, pos.get(word, set()))
        if word in known or term in known:
            skipped += 1
            continue
        text = pool.get(word, {}).get("text", "")
        usage = text.split(":", 1)[1].split(" / ")[0].strip()[:80] if ":" in text else ""
        added.append({"head": word, "axes": [], "usage": usage, "terms": [term],
                      "aliases": {word: term} if term != word else {}, "made_up": [], "odd": [],
                      "added": ADDED, "sure": sure})
        known.update({word, term})

    bundle["rows"] = rows + added
    bundle["terms"] = len({t for r in bundle["rows"] for t in r["terms"]})
    bundle["aliases"] = sum(len(r["aliases"]) for r in bundle["rows"])
    BUNDLE.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"기존 묶음": len(rows), "새 묶음": len(added), "이미 있음": skipped,
                      "그중 애매": sum(not a["sure"] for a in added), "검색어": bundle["terms"]}, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

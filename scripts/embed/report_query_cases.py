"""검색어 목적 분리 점검표를 돌려 표로 보여준다. 사용법은 query_cases.py.
  --fail     틀린 것만
  --nearest  사전에 없는 말까지(KURE-v1 필요)"""
import sys

from kiwipiepy import Kiwi

from query_cases import CASES, NEAREST_CASES
from query_parse import build_lexicon, parse


def check_all(with_nearest=False):
    kiwi = Kiwi()
    lexicon = build_lexicon(kiwi)
    nearest, groups = None, dict(CASES)
    if with_nearest:
        from purpose_nearest import NearestPurpose, kure_encoder
        nearest = NearestPurpose(lexicon, kure_encoder(local_only=True), kiwi=kiwi)
        # 같은 검색어가 두 표에 있으면 가까움 비교 쪽 기대를 쓴다
        overridden = {q for cases in NEAREST_CASES.values() for q, *_ in cases}
        groups = {g: [c for c in cases if c[0] not in overridden] for g, cases in groups.items()}
        groups.update(NEAREST_CASES)
    for group, cases in groups.items():
        for query, purposes, details, gender, mood in cases:
            got = parse(query, kiwi, lexicon, nearest=nearest)
            want = {"purposes": purposes, "details": details, "gender": gender, "mood_text": mood}
            have = {key: got[key] for key in want}
            yield group, query, want, have, want == have


def show(value):
    parts = ["+".join(value["purposes"]) or "-"]
    if value["details"]:
        parts.append(",".join(d.split(".", 1)[1] for d in value["details"]))
    if value["gender"]:
        parts.append(value["gender"])
    if value["mood_text"]:
        parts.append(f'무드 "{value["mood_text"]}"')
    return " · ".join(parts)


if __name__ == "__main__":
    only_fail = "--fail" in sys.argv
    rows = list(check_all(with_nearest="--nearest" in sys.argv))
    group = None
    for g, query, want, have, ok in rows:
        if only_fail and ok:
            continue
        if g != group:
            print(f"\n## {g}")
            group = g
        print(f"{'✅' if ok else '❌'} {query:14} {show(have)}" + ("" if ok else f"   ← 기대 {show(want)}"))
    fails = sum(1 for *_, ok in rows if not ok)
    print(f"\n{len(rows) - fails}/{len(rows)} 맞음")

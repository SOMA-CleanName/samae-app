"""사전형을 검색 꼴(관형형)로 바꾼다.

사진 검색어는 "{낱말} 사진" 으로 읽힌다. 그래서 '조용하다' 가 아니라 '조용한' 이어야 한다.
형용사는 -ㄴ/은, 동사는 -는 을 붙인다. 둘을 가르는 건 규칙으로 안 되므로
품사는 밖에서 알려준다(verb=True/False).
"""
import re

CHO, JUNG = 588, 28
BASE = 0xAC00
JONG = "_ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"

def _split(ch: str):
    if not ("가" <= ch <= "힣"):
        return None
    code = ord(ch) - BASE
    return code // CHO, (code % CHO) // JUNG, code % JUNG

def _join(cho: int, jung: int, jong: int) -> str:
    return chr(BASE + cho * CHO + jung * JUNG + jong)

# ㅎ 받침이어도 규칙 활용하는 어간 — 좋 + 은 = 좋은 (존 이 아니다).
REGULAR_H = set("좋놓넣낳닿쌓찧빻땋")
# ㅅ불규칙은 몇 개뿐이다. 나머지(솟·웃·벗·씻·빗·뺏)는 규칙이다 — 솟 + 은 = 솟은 (소은 이 아니다).
IRREGULAR_S = set("낫붓잇젓긋짓잣")
# ㅂ불규칙은 형용사가 대부분이고(덥다 → 더운) 좁다 · 수줍다만 규칙이다. 동사는 반대로 규칙이 대부분이다 —
# 잡 + 은 = 잡은(자운 이 아니다), 입은 · 씹은 · 뽑은. 불규칙 동사는 몇 개뿐이다(눕다 → 누운, 돕다 → 도운).
REGULAR_B_ADJ = ("좁", "수줍")
IRREGULAR_B_VERB = set("눕돕줍굽깁")

def add_n(stem: str, verb: bool = False) -> str:
    """어간에 관형형 어미 -ㄴ/-은 을 붙인다(동사면 지난 꼴: 겁먹은). 불규칙은 여기서 처리한다."""
    parts = _split(stem[-1])
    if parts is None:
        return stem + "은"
    cho, jung, jong = parts
    tail = JONG[jong]
    if tail == "_":                       # 받침 없음 — 흐리 + ㄴ = 흐린
        return stem[:-1] + _join(cho, jung, JONG.index("ㄴ"))
    if tail == "ㅂ" and (stem[-1] in IRREGULAR_B_VERB if verb else not stem.endswith(REGULAR_B_ADJ)):   # ㅂ불규칙 — 덥 + 은 = 더운
        return stem[:-1] + _join(cho, jung, 0) + "운"
    if tail == "ㅎ" and stem[-1] not in REGULAR_H:   # ㅎ불규칙 — 하얗 + ㄴ = 하얀
        return stem[:-1] + _join(cho, jung, JONG.index("ㄴ"))
    if tail == "ㄹ":                      # ㄹ탈락 — 길 + ㄴ = 긴
        return stem[:-1] + _join(cho, jung, JONG.index("ㄴ"))
    if tail == "ㅅ" and stem[-1] in IRREGULAR_S:   # ㅅ불규칙 — 낫 + 은 = 나은
        return stem[:-1] + _join(cho, jung, 0) + "은"
    return stem + "은"

# 꼴이 정해진 꼬리. 동사/형용사를 가릴 것 없이 결과가 하나다.
FIXED = {
    "스럽다": "스러운", "롭다": "로운", "없다": "없는", "있다": "있는",
    "되다": "된", "지다": "진", "거리다": "거리는", "대다": "대는", "이다": "이는",
}

def add_neun(stem: str) -> str:
    """동사 어간에 -는 을 붙인다. ㄹ 받침은 떨어진다 — 놀 + 는 = 노는(놀는 이 아니다)."""
    parts = _split(stem[-1])
    if parts and JONG[parts[2]] == "ㄹ":
        return stem[:-1] + _join(parts[0], parts[1], 0) + "는"
    return stem + "는"

def adnominal(word: str, verb: bool = False, past: bool = False) -> str:
    """검색 꼴로 바꾼다. 이미 관형형이거나 명사면 그대로 둔다. 동사는 -는(빛나는), past 면 지난 꼴(겁먹은)."""
    for tail, repl in FIXED.items():
        if word.endswith(tail) and len(word) > len(tail):
            return word[: -len(tail)] + repl
    if word.endswith("하다"):
        return word[:-2] + ("하는" if verb and not past else "한")
    if word.endswith("다") and len(word) > 1:
        stem = word[:-1]
        if verb and not past:
            return add_neun(stem)
        return add_n(stem, verb)
    if word.endswith("적"):
        return word + "인"
    return word

ADVERB = re.compile(r"(히|이|하니|로이|스레)$")

def is_adverb(word: str) -> bool:
    """부사는 검색어로 못 쓴다 — '허술히 사진' 은 말이 안 된다."""
    return bool(ADVERB.search(word)) and not word.endswith("다")

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

def add_n(stem: str) -> str:
    """어간에 관형형 어미 -ㄴ/-은 을 붙인다. 불규칙은 여기서 처리한다."""
    parts = _split(stem[-1])
    if parts is None:
        return stem + "은"
    cho, jung, jong = parts
    tail = JONG[jong]
    if tail == "_":                       # 받침 없음 — 흐리 + ㄴ = 흐린
        return stem[:-1] + _join(cho, jung, JONG.index("ㄴ"))
    if tail == "ㅂ":                      # ㅂ불규칙 — 덥 + 은 = 더운
        return stem[:-1] + _join(cho, jung, 0) + "운"
    if tail == "ㅎ":                      # ㅎ불규칙 — 하얗 + ㄴ = 하얀
        return stem[:-1] + _join(cho, jung, JONG.index("ㄴ"))
    if tail == "ㄹ":                      # ㄹ탈락 — 길 + ㄴ = 긴
        return stem[:-1] + _join(cho, jung, JONG.index("ㄴ"))
    if tail == "ㅅ" and stem[-1] not in "웃벗":   # ㅅ불규칙 — 낫 + 은 = 나은
        return stem[:-1] + _join(cho, jung, 0) + "은"
    return stem + "은"

# 꼴이 정해진 꼬리. 동사/형용사를 가릴 것 없이 결과가 하나다.
FIXED = {
    "스럽다": "스러운", "롭다": "로운", "없다": "없는", "있다": "있는",
    "되다": "된", "지다": "진", "거리다": "거리는", "대다": "대는", "이다": "이는",
}

def adnominal(word: str, verb: bool = False) -> str:
    """검색 꼴로 바꾼다. 이미 관형형이거나 명사면 그대로 둔다."""
    for tail, repl in FIXED.items():
        if word.endswith(tail) and len(word) > len(tail):
            return word[: -len(tail)] + repl
    if word.endswith("하다"):
        return word[:-2] + ("하는" if verb else "한")
    if word.endswith("다") and len(word) > 1:
        stem = word[:-1]
        return stem + "는" if verb else add_n(stem)
    if word.endswith("적"):
        return word + "인"
    return word

ADVERB = re.compile(r"(히|이|하니|로이|스레)$")

def is_adverb(word: str) -> bool:
    """부사는 검색어로 못 쓴다 — '허술히 사진' 은 말이 안 된다."""
    return bool(ADVERB.search(word)) and not word.endswith("다")

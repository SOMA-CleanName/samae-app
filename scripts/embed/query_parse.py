"""검색어에서 사진 목적을 떼어낸다.

"가을 커플스냅" 을 통째로 SigLIP 에 넣으면 눈에 뚜렷한 대상(커플)이 분위기(가을)를
삼킨다 — 벡터가 "커플스냅" 과 0.942, "가을" 과 0.842 로 가까워 가을이 거의 반영되지
않았다. 그래서 목적은 필터로 따로 쓰고, SigLIP 에는 목적을 뺀 나머지만 넣는다.

목적은 7개로 닫혀 있으니 사전으로 찾는다(모델을 쓰지 않는다). 사전은 사진 목적 분류가
쓰는 PURPOSE_PHRASES 를 그대로 가져온다 — 둘이 따로 놀면 "커플" 로 분류된 사진을
"커플" 로 검색해도 못 찾는 일이 생긴다.

사전만으로는 낱말 경계를 모른다. "아기자기한" 에서 "아기" 를 찾아 행사로 잡았다.
그래서 Kiwi 로 형태소를 쪼갠 뒤 **형태소 단위로** 대조한다.
"""
from purpose_text import PURPOSE_ORDER, PURPOSE_PHRASES

# 검색창에서 사람이 치는 말. 작가 글 기준으로 만든 PURPOSE_PHRASES 에는 없었다.
# 사진 분류 사전에는 넣지 않는다 — 넣으면 매일 오전 6시 목적 분류 결과까지 바뀐다.
SEARCH_PHRASES = {
    # "남자 프로필" "여자 스냅" 은 혼자 찍는 사진이다. "남자친구" 는 두 조각(남자+친구)으로
    # 쪼개지지만 사전의 "남자친구" 도 똑같이 쪼개 긴 것부터 맞추므로 커플로 잡힌다.
    "personal": ("남자", "여자", "남성", "여성"),
    "pet": ("강아지", "고양이", "댕댕이", "냥이", "애견", "애묘", "펫"),
    "couple": ("남친", "여친", "남자친구", "여자친구", "연애"),
    # 가족 사진은 목적이 따로 없어 행사로 둔다 (2026-09-18 결정)
    "event": ("가족", "가족사진", "가족 사진"),
}

# 모든 사진이 사진이다. SigLIP 에 넣어 봐야 뜻이 없고, 남기면 목적처럼 굴기도 한다.
FORMAT_WORDS = {"스냅", "사진", "촬영", "찍기"}

# 성별 낱말. 개인 사진을 찾는 말이면서, 무엇보다 **그 성별이 찍힌 사진**을 찾는 말이다.
#
# 개인 목적으로 판정되면 성별도 필터로 쓴다 — 앱이 사진마다 "여자" 와 "남자" 중 어느 쪽에
# 가까운지 비교해 가른다. 점수 순위로 자르면 안 된다. 개인 사진 1,027장 중 약 1,000장이
# 여성이라 "여자" 는 평균보다 튀는 사진이 없고(z 2.0 이상 10장), 상위 300장으로 자르면
# 여자 사진 대부분이 잘린다(2026-09-18 실측: "여자" 282장, "남자" 106장 중 남자 약 24장).
#
# 다른 목적이 이겨 개인이 물러나면("여자 커플스냅") 성별 필터는 쓰지 않는다 — 커플 사진에는
# 두 성별이 다 있다. 그때는 예전처럼 글자를 SigLIP 에 남긴다.
GENDER_WORDS = {"남자": "male", "남성": "male", "여자": "female", "여성": "female"}

# 웨딩은 커플을 품는다. "웨딩 커플" 은 웨딩을 찾는 것이다.
SUPERSEDES = {"wedding": {"couple"}}


def _is_function(tag):
    """조사·어미·서술격 조사·문장부호 — 뜻을 싣지 않는다."""
    return tag.startswith(("J", "E", "S")) or tag == "VCP"


def _content_forms(kiwi, text):
    return tuple(t.form for t in kiwi.tokenize(text) if not _is_function(t.tag))


def build_lexicon(kiwi):
    """목적 문구를 검색어와 같은 방식으로 쪼갠 사전. 긴 문구부터 맞춘다."""
    entries = []
    for purpose, phrases in PURPOSE_PHRASES.items():
        entries += [(purpose, phrase) for phrase, _strength in phrases]
    for purpose, phrases in SEARCH_PHRASES.items():
        entries += [(purpose, phrase) for phrase in phrases]
    lexicon = {}
    for purpose, phrase in entries:
        forms = _content_forms(kiwi, phrase)
        if forms:
            lexicon.setdefault(forms, (purpose, phrase))
    return sorted(lexicon.items(), key=lambda item: (-len(item[0]), -sum(map(len, item[0]))))


def parse(query, kiwi, lexicon=None):
    """검색어 → 목적 / SigLIP 에 넣을 나머지 글자.

    검색어에서는 약한 단서(강도 1)도 목적으로 본다. 작가 글의 "커플" 은 "커플 촬영 가능"
    같은 나열일 수 있어 확정하지 않았지만, 검색창에 "커플" 이라고 쳤다면 커플을 찾는 것이다.
    """
    lexicon = lexicon if lexicon is not None else build_lexicon(kiwi)
    tokens = kiwi.tokenize(query)
    content = [i for i, t in enumerate(tokens) if not _is_function(t.tag)]
    forms = [tokens[i].form for i in content]
    used = set()
    found, matched = set(), []
    gender_spans = []   # (성별, 형태소 위치들) — 성별 필터를 쓸 때만 글자에서 뗀다

    position = 0
    while position < len(content):
        for phrase_forms, (purpose, phrase) in lexicon:
            size = len(phrase_forms)
            if tuple(forms[position:position + size]) == phrase_forms:
                found.add(purpose)
                matched.append(phrase)
                if phrase in GENDER_WORDS:
                    gender_spans.append((GENDER_WORDS[phrase], content[position:position + size]))
                else:
                    used.update(content[position:position + size])
                position += size
                break
        else:
            if forms[position] in FORMAT_WORDS:
                used.add(content[position])
            position += 1

    for winner, losers in SUPERSEDES.items():
        if winner in found:
            found -= losers
    # 개인은 다른 목적과 함께 나오면 물러난다 — "남녀 커플" "커플 프로필" 은 커플을 찾는 것이다.
    if len(found) > 1:
        found.discard("personal")

    # 성별은 개인 사진을 찾을 때, 한 성별만 나왔을 때만 필터로 쓴다("여자 남자" 는 가르지 않는다).
    genders = {gender for gender, _ in gender_spans}
    gender = next(iter(genders)) if "personal" in found and len(genders) == 1 else None
    if gender:
        for _, positions in gender_spans:
            used.update(positions)

    # 뗀 낱말에 붙은 조사도 함께 뗀다 — "강아지랑 산책" 에서 "랑" 이 남지 않게.
    for index in sorted(used):
        follow = index + 1
        while follow < len(tokens) and _is_function(tokens[follow].tag) and follow not in used:
            used.add(follow)
            follow += 1

    # 원래 글자에서 뗀 부분만 지운다. 형태소를 다시 이어 붙이면 "힙한" 이 "힙 하 ㄴ" 이 된다.
    keep = [True] * len(query)
    for index in used:
        token = tokens[index]
        for offset in range(token.start, token.start + token.len):
            keep[offset] = False
    rest = "".join(ch if keep[i] else " " for i, ch in enumerate(query))
    return {
        "purposes": [p for p in PURPOSE_ORDER if p in found],
        "gender": gender,
        "mood_text": " ".join(rest.split()),
        "matched": matched,
    }

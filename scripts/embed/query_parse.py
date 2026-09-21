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
import json
from pathlib import Path

from purpose_text import PURPOSE_ORDER, PURPOSE_PHRASES

# 목적 세부분류 체계 — 앱과 같은 파일을 읽는다(src/lib/purpose-details.json, docs/39 §3).
# search 에 적힌 말은 목적과 세부분류를 함께 준다: "임신" → 행사 + event.maternity.
DETAILS_PATH = Path(__file__).resolve().parents[2] / "src" / "lib" / "purpose-details.json"


def load_detail_phrases(path=DETAILS_PATH):
    taxonomy = json.loads(path.read_text(encoding="utf-8"))
    return [
        (purpose, phrase, f"{purpose}.{item['key']}")
        for purpose, items in taxonomy.items() if not purpose.startswith("$")
        for item in items
        for phrase in item.get("search", [])
    ]

# 검색창에서 사람이 치는 말. 작가 글 기준으로 만든 PURPOSE_PHRASES 에는 없었다.
# 사진 분류 사전에는 넣지 않는다 — 넣으면 매일 오전 6시 목적 분류 결과까지 바뀐다.
SEARCH_PHRASES = {
    # "남자 프로필" "여자 스냅" 은 혼자 찍는 사진이다. "남자친구" 는 두 조각(남자+친구)으로
    # 쪼개지지만 사전의 "남자친구" 도 똑같이 쪼개 긴 것부터 맞추므로 커플로 잡힌다.
    #
    # 세부분류가 있는 말(임신·돌·신혼여행·형제 …)은 여기가 아니라 purpose-details.json 에 있다.
    # 여기는 목적만 알려주는 말이다.
    # 목적 이름만 쳐도 목적이다 — "개인" 이 빠져 무드로 넘어가 300장만 나왔다(2026-09-19)
    "personal": ("개인", "남자", "여자", "남성", "여성", "셀프", "혼자"),
    "wedding": ("결혼",),
    "pet": ("펫",),
    # 신혼여행·허니문은 커플이다. 세부분류 "여행" 은 사진으로 가르기 어려워 뺐다(2026-09-18) — 커플 전체로 찾는다
    "couple": ("남친", "여친", "남자친구", "여자친구", "연애", "신혼여행", "허니문"),
    "event": ("행사",),
}
# 2026-09-18 결정: 신혼여행 → 커플, 형제·자매 → 우정, 가족 → 행사, "돌" 한 글자도 돌잔치
# (돌담·돌계단은 Kiwi 가 한 낱말로 읽어 걸리지 않는다).

# 목적이 아니라고 정한 말 — 사전에도 넣지 않고, 가까움 비교(purpose_nearest)도 하지 않는다. 이유는 아래.
NOT_PURPOSE = {"화보", "컨셉", "콘셉트", "인테리어"}

# 사전에 넣지 않는 말 (2026-09-18).
#   · 화보·컨셉 — "누가·왜" 가 아니라 "어떤 느낌으로" 다. 개인 화보도 브랜드 화보도 있다.
#     목적은 함께 쓴 말이 정하고("쇼핑몰 화보" → 상업), 혼자 오면 무드로 SigLIP 에 넘긴다
#   · 인테리어 — 공간 촬영(상업)일 수도, "인테리어 예쁜 카페" 같은 장면 말일 수도 있다
#   · 1인·100일 처럼 숫자가 붙은 말 — Kiwi 가 숫자(SN)를 떼어 "인" "일" 만 남아 엉뚱한 말에 걸린다.
#     기념일·백일로 잡는다

# 모든 사진이 사진이다. SigLIP 에 넣어 봐야 뜻이 없고, 남기면 목적처럼 굴기도 한다.
FORMAT_WORDS = {"스냅", "사진", "촬영", "찍기", "찍"}   # "찍기" 는 Kiwi 가 찍/VV + 기/ETN 로 쪼갠다

# 목적 말 바로 뒤에 오면 비유다 — "개인적인 분위기" "가족 같은 따뜻함" "친구처럼" "커플스러운" 은
# 그 목적을 찾는 게 아니라 느낌을 말한다. 목적으로 잡지 않고 글자째 무드로 둔다(2026-09-19).
FIGURATIVE = {("적", "XSN"), ("같", "VA"), ("처럼", "JKB"), ("같이", "JKB"), ("같이", "MAG"), ("스럽", "XSA-I"), ("스럽", "XSA")}
# 목적 말 바로 뒤의 복수 접미사는 목적 말과 함께 뗀다 — "친구들이랑 바다" 가 무드 "들이랑 바다" 가 됐다.
PLURAL = ("들", "XSN")


def _word_at(query, offset):
    """offset 이 속한 띄어쓰기 낱말 — 형태소로 쪼개기 전 모양."""
    start = query.rfind(" ", 0, offset) + 1
    end = query.find(" ", offset)
    return query[start:end if end != -1 else len(query)]


def _figurative(tokens, last):
    """목적 말(마지막 형태소 위치 last) 바로 뒤가 비유 표지인가."""
    nxt = last + 1
    return nxt < len(tokens) and (tokens[nxt].form, tokens[nxt].tag) in FIGURATIVE

# 성별 낱말. 개인 사진을 찾는 말이면서, 무엇보다 **그 성별이 찍힌 사진**을 찾는 말이다.
#
# 개인 목적으로 판정되면 성별도 필터로 쓴다 — 앱이 사진마다 "여자" 와 "남자" 중 어느 쪽에
# 가까운지 비교해 가른다. 점수 순위로 자르면 안 된다. 개인 사진 1,027장 중 약 1,000장이
# 여성이라 "여자" 는 평균보다 튀는 사진이 없고(z 2.0 이상 10장), 상위 300장으로 자르면
# 여자 사진 대부분이 잘린다(2026-09-18 실측: "여자" 282장, "남자" 106장 중 남자 약 24장).
#
# 다른 목적이 이겨 개인이 물러나면("여자 커플스냅") 성별 필터는 쓰지 않고 글자도 버린다 — 커플 사진에는
# 두 성별이 다 있다. 글자를 무드로 남겼더니 "여자" 와 가까운 전체 300장이 개인 사진으로 채워져
# 커플 사진이 2장만 남았다(2026-09-18). 여성 두 명의 커플 같은 구성은 사진에 정보가 없어 가르지 못한다.
GENDER_WORDS = {"남자": "male", "남성": "male", "여자": "female", "여성": "female"}

# 웨딩은 커플을 품는다. "웨딩 커플" 은 웨딩을 찾는 것이다.
SUPERSEDES = {"wedding": {"couple"}}


def _is_function(tag):
    """조사·어미·서술격 조사·문장부호 — 뜻을 싣지 않는다."""
    return tag.startswith(("J", "E", "S")) or tag == "VCP"


def _content_forms(kiwi, text):
    return tuple(t.form for t in kiwi.tokenize(text) if not _is_function(t.tag))


def build_lexicon(kiwi, detail_phrases=None):
    """목적 문구를 검색어와 같은 방식으로 쪼갠 사전. 긴 문구부터 맞춘다.

    세부분류 말을 먼저 넣는다 — 같은 꼴이 목적 사전에도 있으면("만삭") 세부분류까지 주는 쪽이 이긴다.
    """
    entries = list(detail_phrases if detail_phrases is not None else load_detail_phrases())
    for purpose, phrases in PURPOSE_PHRASES.items():
        entries += [(purpose, phrase, None) for phrase, _strength in phrases]
    for purpose, phrases in SEARCH_PHRASES.items():
        entries += [(purpose, phrase, None) for phrase in phrases]
    lexicon = {}
    for purpose, phrase, detail in entries:
        forms = _content_forms(kiwi, phrase)
        if forms:
            lexicon.setdefault(forms, (purpose, phrase, detail))
    return sorted(lexicon.items(), key=lambda item: (-len(item[0]), -sum(map(len, item[0]))))


def parse(query, kiwi, lexicon=None, nearest=None):
    """검색어 → 목적 / SigLIP 에 넣을 나머지 글자.

    nearest(purpose_nearest.NearestPurpose)를 주면, 어느 사전에도 안 걸린 명사를 가장 가까운 사전 예시의
    목적으로 보낸다("학사모" → 졸업). 안 주면 사전만 쓴다(모델이 없는 기계).

    검색어에서는 약한 단서(강도 1)도 목적으로 본다. 작가 글의 "커플" 은 "커플 촬영 가능"
    같은 나열일 수 있어 확정하지 않았지만, 검색창에 "커플" 이라고 쳤다면 커플을 찾는 것이다.
    """
    lexicon = lexicon if lexicon is not None else build_lexicon(kiwi)
    tokens = kiwi.tokenize(query)
    content = [i for i, t in enumerate(tokens) if not _is_function(t.tag)]
    forms = [tokens[i].form for i in content]
    used = set()
    claimed = set()   # 사전 대조에서 이미 다룬 형태소(비유로 판정한 것 포함) — 가까움 비교에 다시 넘기지 않는다
    found, matched, details = set(), [], []
    gender_spans = []   # (성별, 형태소 위치들) — 성별 필터를 쓸 때만 글자에서 뗀다

    position = 0
    while position < len(content):
        for phrase_forms, (purpose, phrase, detail) in lexicon:
            size = len(phrase_forms)
            if tuple(forms[position:position + size]) == phrase_forms:
                span = content[position:position + size]
                position += size
                claimed.update(span)
                if _figurative(tokens, span[-1]):
                    break   # 비유 — 목적이 아니다. 글자는 무드로 남는다
                found.add(purpose)
                matched.append(phrase)
                if detail and detail not in details:
                    details.append(detail)
                if position < len(content) and (tokens[content[position]].form, tokens[content[position]].tag) == PLURAL:
                    span = span + [content[position]]
                    position += 1
                if phrase in GENDER_WORDS:
                    gender_spans.append((GENDER_WORDS[phrase], span))
                else:
                    used.update(span)
                break
        else:
            if forms[position] in FORMAT_WORDS:
                used.add(content[position])
            position += 1

    # 사전에 없는 명사 — 가장 가까운 사전 예시의 목적으로(0.80 이상일 때만, 무드 어휘는 빼고).
    # **사전에서 목적이 하나도 안 나왔을 때만** 한다(2026-09-20). 사전이 이미 답을 줬으면 그게 사람이 정한
    # 분류다 — "커플 워크샵" 에 엉뚱한 목적이 하나 더 붙지 않게. 모델 호출도 대부분의 검색에서 사라진다.
    if nearest is not None and not found:
        for index in content:
            token = tokens[index]
            if index in claimed or token.form in FORMAT_WORDS or _figurative(tokens, index):
                continue
            try:
                hit = nearest(token.form, token.tag, _word_at(query, token.start))
            except Exception:   # noqa: BLE001 — KURE 는 거들 뿐이다. 실패해도 사전 결과로 검색은 산다
                hit = None
            if hit is None:
                continue
            purpose, detail, _score, example = hit
            found.add(purpose)
            matched.append(f"{token.form}≈{example}")
            if detail and detail not in details:
                details.append(detail)
            used.add(index)
            claimed.add(index)
            if index + 1 < len(tokens) and (tokens[index + 1].form, tokens[index + 1].tag) == PLURAL:
                used.add(index + 1)

    # 세부분류는 따로 한 번 더 훑는다. 목적 사전(작가 글 분류용)에 "만삭 스냅" "프로필 촬영" 처럼 세부분류 말을
    # 품은 더 긴 문구가 있으면 그게 먼저 이겨 세부분류가 빠졌다 — "만삭 스냅" 이 행사 전체 25장을 보여줬다(2026-09-18).
    # 두 사전을 일일이 맞추지 않고, 목적이 어떻게 잡혔든 그 안의 세부분류 말을 다시 찾는다.
    position = 0
    while position < len(content):
        for phrase_forms, (_purpose, _phrase, detail) in lexicon:
            if not detail:
                continue
            size = len(phrase_forms)
            if tuple(forms[position:position + size]) == phrase_forms:
                if detail not in details and not _figurative(tokens, content[position + size - 1]):
                    details.append(detail)
                position += size
                break
        else:
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
    other_purpose_won = bool(found) and "personal" not in found
    if gender or other_purpose_won:
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
    purposes = [p for p in PURPOSE_ORDER if p in found]
    return {
        "purposes": purposes,
        "gender": gender,
        # 목적이 물러나면("웨딩 커플 여행" 의 커플) 그 목적의 세부분류도 버린다
        "details": [d for d in details if d.split(".", 1)[0] in found],
        "mood_text": " ".join(rest.split()),
        "matched": matched,
    }

import unittest

from kiwipiepy import Kiwi

from purpose_text import PURPOSE_PHRASES
from query_cases import CASES, NEAREST_CASES
from query_parse import build_lexicon, parse

KIWI = Kiwi()
LEXICON = build_lexicon(KIWI)

# 작가 글 분류 사전(purpose_text.py)에서 세부분류 없이 **목적 전체**를 뜻하는 문구.
# 검색은 이 사전도 같이 쓴다. 세부분류 뜻이 있는 문구가 목적만 들고 있으면 검색에서 세부분류가 빠진다
# ("만삭 스냅" 이 행사 전체 25장을 보여줬다). 새 문구를 넣었는데 세부분류가 안 붙으면 여기서 걸린다 —
# 목적 전체를 뜻하는 말이면 이 목록에 넣고, 세부분류 뜻이 있으면 purpose-details.json 의 search 에 넣는다.
WHOLE_PURPOSE_PHRASES = {
    "personal": {"개인 스냅", "개인스냅", "1인 스냅", "단독 스냅"},
    "couple": {"커플 스냅", "커플스냅", "커플 촬영", "커플 사진", "데이트 스냅", "데이트 촬영",
               "연인 스냅", "연인 촬영", "연인", "데이트", "커플"},
    "friendship": {"우정 스냅", "우정스냅", "우정 촬영", "우정 사진", "친구 스냅", "친구 촬영",
                   "베프 스냅", "우정", "친구", "베프"},
    "wedding": {"웨딩 스냅", "웨딩스냅", "웨딩 사진", "신랑 신부", "신랑신부", "웨딩", "브라이덜"},
    "pet": {"반려동물 촬영", "반려동물 스냅", "펫 촬영", "펫 스냅", "반려동물"},
    "commercial": {"상업 촬영", "상업"},
    "event": set(),
}


class QueryCasesTest(unittest.TestCase):
    def test_every_case(self):
        for group, cases in CASES.items():
            for query, purposes, details, gender, mood in cases:
                with self.subTest(group=group, query=query):
                    got = parse(query, KIWI, LEXICON)
                    self.assertEqual(
                        {"purposes": got["purposes"], "details": got["details"],
                         "gender": got["gender"], "mood_text": got["mood_text"]},
                        {"purposes": purposes, "details": details, "gender": gender, "mood_text": mood},
                    )

    def test_writer_phrases_carry_their_detail(self):
        for purpose, phrases in PURPOSE_PHRASES.items():
            for phrase, _strength in phrases:
                with self.subTest(phrase=phrase):
                    got = parse(phrase, KIWI, LEXICON)
                    self.assertIn(purpose, got["purposes"])
                    if phrase not in WHOLE_PURPOSE_PHRASES[purpose]:
                        self.assertTrue(got["details"], f"'{phrase}' 에 세부분류가 없다 — purpose-details.json 에 넣거나 목적 전체 목록에 넣을 것")


class NearestCasesTest(unittest.TestCase):
    """KURE-v1 이 받아져 있을 때만 — 없는 기계에서는 건너뛴다."""

    @classmethod
    def setUpClass(cls):
        try:
            from purpose_nearest import NearestPurpose, kure_encoder
            cls.nearest = NearestPurpose(LEXICON, kure_encoder(local_only=True), kiwi=KIWI)
        except (ImportError, OSError) as e:
            raise unittest.SkipTest(f"KURE-v1 없음 — {e}")

    def test_every_case(self):
        for group, cases in NEAREST_CASES.items():
            for query, purposes, details, gender, mood in cases:
                with self.subTest(group=group, query=query):
                    got = parse(query, KIWI, LEXICON, nearest=self.nearest)
                    self.assertEqual(
                        {"purposes": got["purposes"], "details": got["details"],
                         "gender": got["gender"], "mood_text": got["mood_text"]},
                        {"purposes": purposes, "details": details, "gender": gender, "mood_text": mood},
                    )


if __name__ == "__main__":
    unittest.main()

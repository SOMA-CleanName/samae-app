import unittest

import numpy as np
from kiwipiepy import Kiwi

from purpose_nearest import NearestPurpose, TEMPLATE, examples_from
from query_parse import build_lexicon, parse

KIWI = Kiwi()
LEXICON = build_lexicon(KIWI)


def fake_encoder(near):
    """문장마다 정해진 벡터 — 모델 없이 규칙만 본다. near = {낱말: [(예시 문구, 유사도)…]}"""
    phrases = [phrase for _p, _d, phrase in examples_from(LEXICON, KIWI)]
    index = {TEMPLATE.format(p): i for i, p in enumerate(phrases)}
    size = len(phrases) + 1

    def encode(texts):
        rows = []
        for text in texts:
            v = np.zeros(size, dtype=np.float32)
            if text in index:
                v[index[text]] = 1.0
            else:
                word = text.replace(" 사진 촬영", "")
                for phrase, score in near.get(word, []):
                    v[index[TEMPLATE.format(phrase)]] = score
            rows.append(v)
        return np.stack(rows)
    return encode


class NearestPurposeTest(unittest.TestCase):
    def make(self, near, mood_words=()):
        return NearestPurpose(LEXICON, fake_encoder(near), mood_words=set(mood_words), kiwi=KIWI)

    def test_close_and_agreeing_neighbours_win(self):
        nearest = self.make({"학사모": [("졸업사진", 0.84), ("졸업식", 0.83), ("졸업식", 0.82)]})
        self.assertEqual(parse("학사모", KIWI, LEXICON, nearest=nearest)["details"], ["event.graduation"])
        self.assertEqual(parse("학사모 쓰고 찍기", KIWI, LEXICON, nearest=nearest)["purposes"], ["event"])

    def test_below_threshold_is_not_a_purpose(self):
        nearest = self.make({"뉴본": [("신생아", 0.74), ("아기", 0.71), ("임신", 0.70)]})
        self.assertEqual(parse("뉴본", KIWI, LEXICON, nearest=nearest)["purposes"], [])

    def test_lonely_winner_is_not_a_purpose(self):
        # 1위만 튀고 2·3위가 다른 목적이면 버린다 — "교복" → 룩북·행사·행사
        nearest = self.make({"교복": [("의류 촬영", 0.82), ("졸업", 0.79), ("졸업사진", 0.78)]})
        result = parse("교복", KIWI, LEXICON, nearest=nearest)
        self.assertEqual(result["purposes"], [])
        self.assertEqual(result["mood_text"], "교복")

    def test_mood_vocabulary_never_becomes_a_purpose(self):
        near = {"멍울": [("멍멍이", 0.92), ("반려견", 0.9), ("강아지", 0.9)]}
        nearest = self.make(near, mood_words={"멍울멍울"})
        self.assertEqual(parse("멍울멍울", KIWI, LEXICON, nearest=nearest)["purposes"], [],
                         "쪼개기 전 낱말이 무드 어휘면 막는다")

    def test_only_nouns(self):
        nearest = self.make({"외롭": [("혼자", 0.95), ("셀프", 0.9), ("개인", 0.9)]})
        self.assertEqual(parse("외로운", KIWI, LEXICON, nearest=nearest)["purposes"], [])

    def test_dictionary_still_comes_first(self):
        nearest = self.make({})
        self.assertEqual(parse("만삭 스냅", KIWI, LEXICON, nearest=nearest)["details"], ["event.maternity"])

    def test_detail_words_keep_their_detail_over_purpose_only_duplicates(self):
        examples = examples_from(LEXICON, KIWI)
        self.assertEqual([e for e in examples if e[2] == "졸업"], [("event", "event.graduation", "졸업")],
                         "졸업은 세부분류 쪽 하나만")
        self.assertIn(("event", "event.graduation", "졸업 촬영"), examples,
                      "작가 글 사전의 목적만 든 예시에도 세부분류를 붙인다")
        self.assertIn(("couple", None, "커플 스냅"), examples, "목적 전체를 뜻하는 예시는 그대로")

    def test_nearest_to_a_purpose_only_example_still_gets_its_detail(self):
        nearest = self.make({"학사모": [("졸업 기념", 0.9), ("졸업 촬영", 0.88), ("졸업식", 0.8)]})
        self.assertEqual(parse("학사모", KIWI, LEXICON, nearest=nearest)["details"], ["event.graduation"])


if __name__ == "__main__":
    unittest.main()

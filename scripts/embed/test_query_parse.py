import unittest

from kiwipiepy import Kiwi

from query_parse import build_lexicon, parse

KIWI = Kiwi()
LEXICON = build_lexicon(KIWI)


def run(query):
    return parse(query, KIWI, LEXICON)


class QueryParseTest(unittest.TestCase):
    def test_purpose_and_mood_split(self):
        result = run("가을 커플스냅")
        self.assertEqual(result["purposes"], ["couple"])
        self.assertEqual(result["mood_text"], "가을", "목적어와 '스냅' 은 SigLIP 에 넣지 않는다")

    def test_purpose_only_leaves_nothing_for_siglip(self):
        self.assertEqual(run("웨딩")["purposes"], ["wedding"])
        self.assertEqual(run("웨딩")["mood_text"], "")
        self.assertEqual(run("남친이랑 사진"), {"purposes": ["couple"], "mood_text": "", "matched": ["남친"]})

    def test_mood_only_keeps_the_original_wording(self):
        result = run("몽환적인 노을")
        self.assertEqual(result["purposes"], [])
        self.assertEqual(result["mood_text"], "몽환적인 노을", "형태소를 이어 붙이지 않고 원문을 그대로 둔다")

    def test_word_boundaries_block_false_purposes(self):
        self.assertEqual(run("아기자기한 카페")["purposes"], [], "'아기자기' 안의 '아기' 는 행사가 아니다")
        self.assertEqual(run("돌담길 스냅")["purposes"], [], "'돌담' 은 돌잔치가 아니다")

    def test_particles_leave_with_the_purpose_word(self):
        result = run("강아지랑 산책")
        self.assertEqual(result["purposes"], ["pet"])
        self.assertEqual(result["mood_text"], "산책", "'랑' 이 남지 않는다")

    def test_family_is_an_event(self):
        self.assertEqual(run("가족사진")["purposes"], ["event"])
        self.assertEqual(run("따뜻한 가족 사진")["mood_text"], "따뜻한")

    def test_wedding_supersedes_couple(self):
        self.assertEqual(run("웨딩 커플 스냅")["purposes"], ["wedding"])

    def test_unrelated_purposes_are_both_kept(self):
        self.assertEqual(run("커플 강아지")["purposes"], ["couple", "pet"])

    def test_gender_words_mean_a_personal_shoot(self):
        self.assertEqual(run("남자 프로필")["purposes"], ["personal"])
        self.assertEqual(run("여자 스냅"), {"purposes": ["personal"], "mood_text": "", "matched": ["여자"]})

    def test_boyfriend_is_a_couple_not_a_man(self):
        self.assertEqual(run("남자친구랑 데이트")["purposes"], ["couple"])

    def test_personal_steps_back_for_other_purposes(self):
        self.assertEqual(run("여자 커플스냅")["purposes"], ["couple"])
        self.assertEqual(run("남자 웨딩")["purposes"], ["wedding"])

    def test_spacing_does_not_matter(self):
        self.assertEqual(run("커플 스냅")["purposes"], run("커플스냅")["purposes"])


if __name__ == "__main__":
    unittest.main()

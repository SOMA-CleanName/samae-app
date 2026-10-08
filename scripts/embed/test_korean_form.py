import unittest

from korean_form import adnominal


class AdnominalTest(unittest.TestCase):
    def test_irregular_stems_still_bend(self):
        self.assertEqual(adnominal("하얗다"), "하얀")    # ㅎ불규칙
        self.assertEqual(adnominal("덥다"), "더운")      # ㅂ불규칙
        self.assertEqual(adnominal("길다"), "긴")        # ㄹ탈락
        self.assertEqual(adnominal("낫다"), "나은")      # ㅅ불규칙

    def test_regular_stems_are_not_bent_like_irregular_ones(self):
        # 좋다·사이좋다를 ㅎ불규칙으로 돌려 "존"·"사이존" 이 나온 적이 있다
        self.assertEqual(adnominal("좋다"), "좋은")
        self.assertEqual(adnominal("사이좋다"), "사이좋은")
        # 솟다를 ㅅ불규칙으로 돌려 "소은"·"샘소은" 이 나온 적이 있다
        self.assertEqual(adnominal("솟다"), "솟은")
        self.assertEqual(adnominal("솟다", verb=True), "솟는")

    def test_b_stem_verbs_are_regular(self):
        # 잡다를 형용사처럼 ㅂ불규칙으로 돌려 "감을 자운" 이 나온 적이 있다
        self.assertEqual(adnominal("감을 잡다", verb=True, past=True), "감을 잡은")
        self.assertEqual(adnominal("눕다", verb=True, past=True), "누운")
        self.assertEqual(adnominal("좁다"), "좁은")
        self.assertEqual(adnominal("수줍다"), "수줍은")

    def test_l_stem_drops_before_neun(self):
        # "딩굴는" · "점글는" 이 나온 적이 있다
        self.assertEqual(adnominal("뒹굴다", verb=True), "뒹구는")
        self.assertEqual(adnominal("놀다", verb=True), "노는")
        self.assertEqual(adnominal("놀다", verb=True, past=True), "논")
        # -하다 동사의 지난 꼴이 "폴짝하는" 으로 나온 적이 있다
        self.assertEqual(adnominal("폴짝하다", verb=True, past=True), "폴짝한")

    def test_verbs_take_the_present_form(self):
        self.assertEqual(adnominal("반짝이다", verb=True), "반짝이는")
        self.assertEqual(adnominal("조용하다"), "조용한")


if __name__ == "__main__":
    unittest.main()

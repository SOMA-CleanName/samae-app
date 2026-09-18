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
        self.assertEqual(run("남친이랑 사진"), {"purposes": ["couple"], "gender": None, "details": [], "mood_text": "", "matched": ["남친"]})

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
        self.assertEqual(run("여자 스냅"), {"purposes": ["personal"], "gender": "female", "details": [], "mood_text": "", "matched": ["여자"]})

    def test_gender_becomes_a_filter_for_personal_shoots(self):
        # 점수로 자르면 여자 사진 대부분이 잘린다 — 성별은 앱이 여자/남자 비교로 가른다
        self.assertEqual(run("남자"), {"purposes": ["personal"], "gender": "male", "details": [], "mood_text": "", "matched": ["남자"]})
        self.assertEqual(run("여성")["gender"], "female")
        self.assertEqual(run("남자 프로필")["mood_text"], "", "프로필도 남자도 필터가 된다")
        self.assertEqual(run("여자 노을"), {"purposes": ["personal"], "gender": "female", "details": [], "mood_text": "노을", "matched": ["여자"]})
        self.assertEqual(run("여자랑 바다")["mood_text"], "바다", "성별 낱말에 붙은 조사도 뗀다")

    def test_gender_stays_in_text_when_another_purpose_wins(self):
        # 커플 사진에는 두 성별이 다 있다 — 가르지 않고 예전처럼 글자로 남긴다
        self.assertEqual(run("여자 커플스냅"), {"purposes": ["couple"], "gender": None, "details": [], "mood_text": "여자", "matched": ["여자", "커플 스냅"]})

    def test_both_genders_are_not_a_filter(self):
        result = run("남자 여자")
        self.assertEqual(result["gender"], None)
        self.assertEqual(result["mood_text"], "남자 여자")

    def test_boyfriend_is_a_couple_not_a_man(self):
        self.assertEqual(run("남자친구랑 데이트")["purposes"], ["couple"])

    def test_personal_steps_back_for_other_purposes(self):
        self.assertEqual(run("여자 커플스냅")["purposes"], ["couple"])
        self.assertEqual(run("남자 웨딩")["purposes"], ["wedding"])

    def test_search_words_people_type(self):
        # 2026-09-18 — 검색창에 칠 법한 말을 넣어 보니 비어 있던 곳들
        cases = {
            "event": ["임신", "임산부", "만삭", "돌", "돌스냅", "신생아", "백일", "졸업식", "생일", "환갑", "칠순", "행사"],
            "personal": ["바프", "셀프", "혼자", "취업사진", "바디프로필", "증명사진"],
            "couple": ["기념일", "프러포즈", "청혼", "신혼여행"],
            "friendship": ["형제", "자매", "친구"],
            "wedding": ["리마인드웨딩", "브라이덜샤워", "본식"],
            "commercial": ["메뉴", "쇼핑몰", "룩북"],
        }
        for purpose, words in cases.items():
            for word in words:
                self.assertEqual(run(word)["purposes"], [purpose], word)

    def test_style_words_are_mood_not_purpose(self):
        # 화보는 "어떤 느낌으로" 다 — 목적은 함께 쓴 말이 정한다
        self.assertEqual(run("화보"), {"purposes": [], "gender": None, "details": [], "mood_text": "화보", "matched": []})
        self.assertEqual(run("쇼핑몰 화보")["purposes"], ["commercial"])
        self.assertEqual(run("쇼핑몰 화보")["mood_text"], "화보")
        self.assertEqual(run("인테리어 예쁜 카페")["purposes"], [])

    def test_stone_compounds_are_not_first_birthdays(self):
        self.assertEqual(run("돌계단")["purposes"], [])
        self.assertEqual(run("돌담길 스냅")["purposes"], [])

    def test_pregnancy_keeps_the_mood(self):
        self.assertEqual(run("따뜻한 만삭 사진"), {"purposes": ["event"], "gender": None, "details": ["event.maternity"], "mood_text": "따뜻한", "matched": ["만삭사진"]})
        self.assertEqual(run("임신 기념 바다")["mood_text"], "기념 바다")

    def test_detail_words_give_purpose_and_detail(self):
        # 같은 행사라도 "임신" 과 "돌" 은 다른 사진이다 — 세부분류로 좁힌다(0133)
        self.assertEqual(run("임신")["details"], ["event.maternity"])
        self.assertEqual(run("돌 스냅")["details"], ["event.first_birthday"])
        self.assertEqual(run("가족사진")["details"], ["event.family"])
        self.assertEqual(run("신혼여행"), {"purposes": ["couple"], "gender": None, "details": [], "mood_text": "", "matched": ["신혼여행"]},
                         "여행 세부분류는 뺐다 — 커플 전체로 찾는다")
        self.assertEqual(run("형제")["details"], ["friendship.siblings"])
        self.assertEqual(run("본식 스냅")["details"], ["wedding.ceremony"])
        self.assertEqual(run("비즈니스 프로필")["details"], ["commercial.business_profile"])
        self.assertEqual(run("여자 바디프로필")["details"], ["personal.body_profile"])
        self.assertEqual(run("여자 바디프로필")["gender"], "female")

    def test_snap_words_do_not_narrow(self):
        # "커플스냅" 은 커플 전체를 찾는 말이다 — 스냅 세부분류로 좁히면 기념일 사진이 빠진다
        self.assertEqual(run("커플스냅")["details"], [])
        self.assertEqual(run("우정 스냅")["details"], [])

    def test_details_leave_with_their_purpose(self):
        self.assertEqual(run("웨딩 커플 여행")["purposes"], ["wedding"])
        self.assertEqual(run("웨딩 커플 여행")["details"], [], "커플이 물러나면 커플 여행도 버린다")

    def test_two_details_in_one_purpose(self):
        self.assertEqual(run("돌잔치 가족사진")["details"], ["event.first_birthday", "event.family"])

    def test_spacing_does_not_matter(self):
        self.assertEqual(run("커플 스냅")["purposes"], run("커플스냅")["purposes"])


if __name__ == "__main__":
    unittest.main()

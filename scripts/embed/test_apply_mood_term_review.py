import unittest

from apply_mood_term_review import apply


def bundles():
    terms = {"rows": [
        {"head": "걱정하다", "axes": ["감정"], "usage": "불안한 표정",
         "terms": ["걱정한", "공포"], "aliases": {"걱정하다": "걱정한", "무서워하다": "걱정한", "공포감": "공포"},
         "made_up": ["전의"], "odd": []},
        {"head": "노을", "axes": ["빛"], "usage": "붉은 하늘", "terms": ["노을"], "aliases": {},
         "made_up": [], "odd": []},
    ], "terms": 3, "aliases": 3, "collisions": {}}
    axes = {"heads": 2, "words": 5, "per_axis": {}, "groups": [
        {"head": "걱정하다", "axes": ["감정"], "members": ["무서워하다", "공포", "공포감"],
         "prompts": ["worried face"], "usage": "불안한 표정"},
        {"head": "노을", "axes": ["빛"], "members": [], "prompts": ["sunset glow"], "usage": "붉은 하늘"},
    ]}
    return terms, axes


SPLIT = [{"head": "걱정하다", "groups": [
    {"head": "걱정하다", "axes": ["감정"], "usage": "마음 졸이는 표정",
     "terms": [{"term": "걱정스러운", "from": ["걱정하다"]}]},
    {"head": "공포", "axes": ["감정"], "usage": "겁에 질린 얼굴", "prompts": ["terrified face"],
     "terms": [{"term": "공포", "from": ["공포", "공포감"]}, {"term": "무서운", "from": ["무서워하다"]}]},
]}]


class ApplyTest(unittest.TestCase):
    def test_split_keeps_origin_head_and_inserts_new_group_after_it(self):
        terms, axes = apply(*bundles(), SPLIT)
        self.assertEqual([r["head"] for r in terms["rows"]], ["걱정하다", "공포", "노을"])
        self.assertEqual(terms["rows"][1]["terms"], ["공포", "무서운"], "첫 검색어가 대표")
        self.assertEqual(terms["rows"][1]["aliases"], {"공포감": "공포", "무서워하다": "무서운"})
        self.assertEqual(terms["rows"][0]["made_up"], ["전의"], "원래 묶음의 기록은 원래 묶음에")
        self.assertEqual(terms["rows"][1]["made_up"], [])

    def test_words_are_neither_lost_nor_doubled(self):
        terms, axes = apply(*bundles(), SPLIT)
        self.assertEqual(axes["words"], 5)
        self.assertEqual(axes["heads"], 3)
        self.assertEqual(axes["per_axis"]["감정"], {"heads": 2, "words": 4})
        self.assertEqual(axes["groups"][0]["prompts"], ["worried face"], "원래 묶음은 프롬프트를 이어받는다")
        self.assertEqual(axes["groups"][1]["prompts"], ["terrified face"])

    def test_untouched_groups_pass_through(self):
        terms, _ = apply(*bundles(), SPLIT)
        self.assertEqual(terms["rows"][2]["terms"], ["노을"])

    def test_new_head_must_not_clash_with_an_existing_group(self):
        clash = [{"head": "걱정하다", "groups": [
            SPLIT[0]["groups"][0], {**SPLIT[0]["groups"][1], "head": "노을"}]}]
        with self.assertRaises(ValueError):
            apply(*bundles(), clash)


if __name__ == "__main__":
    unittest.main()

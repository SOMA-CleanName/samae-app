import unittest

from apply_mood_group_split import split


def bundles():
    terms = {"rows": [
        {"head": "외롭다", "axes": ["감정"], "usage": "혼자 남은 뒷모습",
         "terms": ["외로운", "외딴", "구슬픈", "슬픈"],
         "aliases": {"외롭다": "외로운", "외로이": "외로운", "외지다": "외딴", "구슬프다": "구슬픈", "슬퍼하다": "슬픈"},
         "made_up": [], "odd": []},
        {"head": "슬프다", "axes": ["감정"], "usage": "눈물 고인 얼굴", "terms": ["슬픈"],
         "aliases": {"슬프다": "슬픈"}, "made_up": [], "odd": []},
        {"head": "노을", "axes": ["빛"], "usage": "붉은 하늘", "terms": ["노을"], "aliases": {},
         "made_up": [], "odd": []},
    ], "terms": 6, "aliases": 6, "collisions": {}}
    axes = {"heads": 3, "words": 8, "per_axis": {}, "groups": [
        {"head": "외롭다", "axes": ["감정"], "members": ["외로이", "외지다", "외딴", "구슬프다", "슬퍼하다"],
         "prompts": ["lonely"], "usage": "혼자 남은 뒷모습"},
        {"head": "슬프다", "axes": ["감정"], "members": [], "prompts": ["sad"], "usage": "눈물 고인 얼굴"},
        {"head": "노을", "axes": ["빛"], "members": [], "prompts": ["sunset"], "usage": "붉은 하늘"},
    ]}
    return terms, axes


DECISION = [{"head": "외롭다", "keep": ["외로운"],
             "new": [{"head": "외지다", "axes": ["공간"], "usage": "외딴 집", "prompts": ["remote house"],
                      "terms": ["외딴"]}],
             "move": [{"to": "슬프다", "terms": ["구슬픈", "슬픈"]}]}]


class SplitTest(unittest.TestCase):
    def test_keep_new_move(self):
        terms, axes = split(*bundles(), DECISION)
        rows = {r["head"]: r for r in terms["rows"]}
        self.assertEqual([r["head"] for r in terms["rows"]], ["외롭다", "외지다", "슬프다", "노을"], "새 묶음은 원래 묶음 바로 뒤")
        self.assertEqual(rows["외롭다"]["terms"], ["외로운"])
        self.assertEqual(rows["외롭다"]["aliases"], {"외롭다": "외로운", "외로이": "외로운"})
        self.assertEqual(rows["외지다"]["axes"], ["공간"])
        self.assertEqual(rows["외지다"]["aliases"], {"외지다": "외딴"})

    def test_move_merges_same_term_and_carries_words(self):
        terms, axes = split(*bundles(), DECISION)
        rows = {r["head"]: r for r in terms["rows"]}
        groups = {g["head"]: g for g in axes["groups"]}
        self.assertEqual(rows["슬프다"]["terms"], ["슬픈", "구슬픈"], "같은 검색어는 하나로, 새것은 뒤에")
        self.assertEqual(rows["슬프다"]["aliases"]["슬퍼하다"], "슬픈")
        self.assertEqual(sorted(groups["슬프다"]["members"]), ["구슬프다", "슬퍼하다"])
        self.assertEqual(terms["collisions"], {}, "옮기면서 겹침이 풀린다")

    def test_no_word_lost(self):
        _, axes = split(*bundles(), DECISION)
        self.assertEqual(axes["words"], 8, "외롭다 6 + 슬프다 1 + 노을 1 — 옮겨도 그대로")
        self.assertEqual(axes["groups"][1]["members"], ["외딴"], "새 묶음 head 는 식구에서 빠진다")

    def test_new_head_must_be_fresh(self):
        clash = [{**DECISION[0], "new": [{**DECISION[0]["new"][0], "head": "노을"}]}]
        with self.assertRaises(ValueError):
            split(*bundles(), clash)

    def test_empty_keep_dissolves_the_group_into_its_target(self):
        merge = [{"head": "슬프다", "keep": [], "move": [{"to": "외롭다", "terms": ["슬픈"]}]}]
        terms, axes = split(*bundles(), merge)
        rows = {r["head"]: r for r in terms["rows"]}
        groups = {g["head"]: g for g in axes["groups"]}
        self.assertNotIn("슬프다", rows)
        self.assertEqual(rows["외롭다"]["aliases"]["슬프다"], "슬픈", "없어진 묶음 이름으로 찾아도 걸린다")
        self.assertIn("슬프다", groups["외롭다"]["members"])
        self.assertEqual(axes["words"], 8)

    def test_cannot_move_into_a_group_that_disappears(self):
        chain = [{"head": "슬프다", "keep": [], "move": [{"to": "노을", "terms": ["슬픈"]}]},
                 {"head": "외롭다", "keep": ["외로운", "외딴", "구슬픈"], "move": [{"to": "슬프다", "terms": ["슬픈"]}]}]
        with self.assertRaises(ValueError):
            split(*bundles(), chain)


if __name__ == "__main__":
    unittest.main()

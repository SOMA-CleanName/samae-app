"""세부분류 · 성별 초안 규칙 — DB · 모델 없이 순수 함수만 시험한다."""

import unittest

import numpy as np

from scripts.embed import purpose_drafts as drafts


def unit(*values):
    v = np.asarray(values, dtype=np.float64)
    return v / np.linalg.norm(v)


class ChoosePersonalTest(unittest.TestCase):
    def test_profile_in_text_needs_photos_to_back_it(self):
        self.assertEqual(drafts.choose_personal(["personal.profile"], "개인 프로필", 0.6, 0.5, 5)[0], ["personal.profile"])
        # 모글 "개인 프로필 - 한지" — 글은 프로필이어도 사진이 스냅이면 스냅
        self.assertEqual(drafts.choose_personal(["personal.profile"], "개인 프로필", 0.2, 0.5, 5)[0], ["personal.snap"])

    def test_body_profile_and_id_photo_follow_text(self):
        details, why = drafts.choose_personal(["personal.body_profile"], "바디프로필", 0.0, 0.0, 3)
        self.assertEqual((details, why), (["personal.body_profile"], "글"))

    def test_snap_word_in_text_wins_over_photos(self):
        self.assertEqual(drafts.choose_personal([], "백빈건널목 자연스러운 골목스냅", 1.0, 0.99, 5)[0], ["personal.snap"])

    def test_photos_alone_make_profile_only_when_obvious(self):
        self.assertEqual(drafts.choose_personal([], "", 0.95, 0.95, 4)[0], ["personal.profile"])
        self.assertEqual(drafts.choose_personal([], "", 0.95, 0.90, 4)[0], ["personal.snap"])   # 구도가 다양하면 스냅
        self.assertEqual(drafts.choose_personal([], "", 1.0, 0.99, 1)[0], ["personal.snap"])    # 한 장은 판단하지 않는다


class VoteTest(unittest.TestCase):
    def test_majority_of_nearest_prompt(self):
        prompts = np.stack([unit(1, 0, 0), unit(0, 1, 0)])
        photos = np.stack([unit(1, 0.1, 0), unit(0.1, 1, 0), unit(0.2, 1, 0)])
        self.assertEqual(drafts.vote(photos, prompts), (1, 2))

    def test_tie_goes_to_first_seen_like_node_script(self):
        prompts = np.stack([unit(1, 0, 0), unit(0, 1, 0)])
        photos = np.stack([unit(0.1, 1, 0), unit(1, 0.1, 0)])
        self.assertEqual(drafts.vote(photos, prompts)[0], 1)


class GenderTest(unittest.TestCase):
    def test_boundary_and_majority(self):
        female, male = unit(1, 0), unit(0, 1)
        photos = np.stack([unit(1, 0.2), unit(1, 0.1), unit(0.2, 1)])
        self.assertEqual(drafts.gender_of(photos, female, male), ("female", 2, 1))

    def test_tie_is_left_empty(self):
        female, male = unit(1, 0), unit(0, 1)
        photos = np.stack([unit(1, 0.2), unit(0.2, 1)])
        self.assertIsNone(drafts.gender_of(photos, female, male)[0])


class TargetTest(unittest.TestCase):
    def test_manual_is_never_a_target(self):
        album = {"admin_purposes": ["personal"], "admin_purpose_details_source": "manual", "admin_purpose_gender_source": "manual"}
        self.assertFalse(drafts.detail_targets(album, daily=False))
        self.assertFalse(drafts.gender_target(album, daily=False))

    def test_daily_fills_only_missing(self):
        done = {"admin_purposes": ["personal"], "admin_purpose_details": ["personal.snap"],
                "admin_purpose_details_source": "auto", "admin_purpose_gender": "female", "admin_purpose_gender_source": "auto"}
        self.assertFalse(drafts.detail_targets(done, daily=True))
        self.assertFalse(drafts.gender_target(done, daily=True))
        self.assertTrue(drafts.detail_targets(done, daily=False))   # 기준을 바꿔 다시 돌릴 때만
        fresh = {"admin_purposes": ["personal"], "admin_purpose_details": None, "admin_purpose_gender": None}
        self.assertTrue(drafts.detail_targets(fresh, daily=True))
        self.assertTrue(drafts.gender_target(fresh, daily=True))

    def test_daily_fills_a_purpose_that_lost_or_never_had_details(self):
        # 목적이 하나 더 붙었는데 그 목적의 세부분류가 없다
        album = {"admin_purposes": ["personal", "couple"], "admin_purpose_details": ["personal.snap"],
                 "admin_purpose_details_source": "auto"}
        self.assertTrue(drafts.detail_targets(album, daily=True))

    def test_gender_only_for_personal(self):
        self.assertFalse(drafts.gender_target({"admin_purposes": ["couple"]}, daily=True))
        self.assertFalse(drafts.detail_targets({"admin_purposes": []}, daily=True))


class NewPhotoCopyTest(unittest.TestCase):
    def test_new_photo_in_drafted_album_gets_album_value(self):
        album = {"admin_purpose_details": ["personal.snap"], "admin_purpose_details_source": "auto",
                 "admin_purpose_gender": "female", "admin_purpose_gender_source": "auto"}
        photos = [{"admin_purposes": ["personal"], "admin_purpose_details": ["personal.snap"], "admin_purpose_gender": "female"},
                  {"admin_purposes": ["personal"], "admin_purpose_details": None, "admin_purpose_gender": None}]
        self.assertTrue(drafts.photos_missing(album, photos, "admin_purpose_details"))
        self.assertTrue(drafts.photos_missing(album, photos, "admin_purpose_gender"))
        self.assertFalse(drafts.photos_missing(album, photos[:1], "admin_purpose_details"))

    def test_manual_album_is_left_to_inheritance(self):
        album = {"admin_purpose_details": ["personal.snap"], "admin_purpose_details_source": "manual"}
        self.assertFalse(drafts.photos_missing(album, [{"admin_purpose_details": None}], "admin_purpose_details"))

    def test_gender_copy_only_counts_personal_photos(self):
        album = {"admin_purpose_gender": "female", "admin_purpose_gender_source": "auto"}
        self.assertFalse(drafts.photos_missing(album, [{"admin_purposes": ["couple"], "admin_purpose_gender": None}], "admin_purpose_gender"))


class TextPiecesTest(unittest.TestCase):
    def test_split_by_sentence_and_100_chars(self):
        self.assertEqual(list(drafts.text_pieces("이대 졸업 스냅. 가족 사진\n")), ["이대 졸업 스냅", "가족 사진"])
        self.assertEqual([len(p) for p in drafts.text_pieces("가" * 230)], [100, 100, 30])


class PromptsMatchTaxonomyTest(unittest.TestCase):
    def test_prompt_keys_are_known_details(self):
        import json
        from pathlib import Path
        taxonomy = json.loads((Path(__file__).resolve().parents[2] / "src" / "lib" / "purpose-details.json").read_text(encoding="utf-8"))
        known = {(p, item["key"]) for p, items in taxonomy.items() if not p.startswith("$") for item in items}
        for purpose, prompts in drafts.PROMPTS.items():
            for key in prompts:
                self.assertIn((purpose, key), known)


if __name__ == "__main__":
    unittest.main()

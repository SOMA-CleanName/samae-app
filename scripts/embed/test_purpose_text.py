import unittest

from scripts.embed.purpose_text import TextField, classify_text


def field(source: str, text: str, priority: int = 4) -> TextField:
    return TextField(source=source, text=text, priority=priority)


class PurposeTextTest(unittest.TestCase):
    def test_explicit_couple_description_wins(self):
        result = classify_text([
            field("album_description", "영화 분위기의 커플 스냅입니다"),
        ])
        self.assertEqual(result.purpose, "couple")
        self.assertEqual(result.candidates, ("couple",))
        self.assertFalse(result.conflict)

    def test_korean_syllable_inside_unrelated_word_is_not_an_event_signal(self):
        result = classify_text([
            field(
                "album_description",
                "영화 분위기의 커플 스냅입니다. 어느 골목의 일상, 소박하지만 행복한, 훗날 되돌아보게 만드는 추억입니다.",
            ),
        ])
        self.assertEqual(result.purpose, "couple")
        self.assertEqual(result.candidates, ("couple",))

    def test_taxonomy_detail_terms_map_to_parent_purposes(self):
        cases = (
            ("프로필 촬영", "personal"),
            ("웨딩 촬영", "wedding"),
            ("졸업 기념 사진", "event"),
            ("만삭 스냅", "event"),
            ("제품 광고", "commercial"),
            ("반려견 촬영", "pet"),
        )
        for text, expected in cases:
            with self.subTest(text=text):
                self.assertEqual(classify_text([field("album_title", text)]).purpose, expected)

    def test_mood_and_location_only_text_has_no_purpose_signal(self):
        result = classify_text([
            field("hashtags", "필름 빈티지 골목 노을", priority=1),
            field("album_description", "따뜻하고 자연스러운 서울의 하루"),
        ])
        self.assertIsNone(result.purpose)
        self.assertEqual(result.candidates, ())
        self.assertEqual(result.matches, ())

    def test_negated_service_is_not_positive_evidence(self):
        result = classify_text([
            field("package_description", "웨딩은 촬영하지 않습니다", priority=2),
        ])
        self.assertNotIn("wedding", result.candidates)
        self.assertIsNone(result.purpose)

    def test_service_listing_returns_candidates_in_taxonomy_order(self):
        result = classify_text([
            field("package_name", "커플/우정/다인원 촬영", priority=2),
        ])
        self.assertEqual(result.purpose, None)
        self.assertEqual(result.candidates, ("couple", "friendship", "event"))
        self.assertFalse(result.conflict)

    def test_ambiguous_target_category_does_not_pick_one_side(self):
        result = classify_text([
            field("target_category", "커플·우정", priority=3),
        ])
        self.assertIsNone(result.purpose)
        self.assertEqual(result.candidates, ("couple", "friendship"))

    def test_higher_priority_photo_text_overrides_album_text(self):
        result = classify_text([
            field("photo_caption", "오래된 친구와 우정 스냅", priority=5),
            field("album_description", "커플 스냅", priority=4),
        ])
        self.assertEqual(result.purpose, "friendship")
        self.assertFalse(result.conflict)

    def test_equal_priority_explicit_conflict_requires_review(self):
        result = classify_text([
            field("album_title", "커플 스냅", priority=4),
            field("album_description", "우정 스냅", priority=4),
        ])
        self.assertIsNone(result.purpose)
        self.assertEqual(result.candidates, ("couple", "friendship"))
        self.assertTrue(result.conflict)

    def test_explicit_description_beats_lower_priority_hashtag(self):
        result = classify_text([
            field("album_description", "데이트 커플 스냅", priority=4),
            field("hashtags", "우정", priority=1),
        ])
        self.assertEqual(result.purpose, "couple")
        self.assertGreater(result.confidence, 0.8)

    def test_matches_store_only_short_phrase_not_original_description(self):
        original = "두 사람이 함께한 영화 분위기의 커플 스냅입니다"
        result = classify_text([field("album_description", original)])
        self.assertEqual(result.matches[0]["source"], "album_description")
        self.assertEqual(result.matches[0]["phrase"], "커플 스냅")
        self.assertNotIn(original, str(result.matches))


if __name__ == "__main__":
    unittest.main()

import unittest

import numpy as np

from scripts.embed import purpose_classifier as classifier
from scripts.embed import purposes
from scripts.embed.purpose_text import TextEvidence


class PurposeClassifierTest(unittest.TestCase):
    def test_prompt_groups_are_balanced_and_valid(self):
        # Catches one class winning merely because it has more prompt prototypes.
        self.assertEqual(purposes.check_prompts(), 56)
        self.assertEqual({len(values) for values in purposes.PROMPTS.values()}, {8})

    def test_zscore_columns_uses_catalog_statistics_per_prompt(self):
        cosine = np.array([[1.0, 10.0], [2.0, 20.0], [3.0, 30.0]])
        got = classifier.zscore_columns(cosine)
        want = np.array([
            [-1.22474487, -1.22474487],
            [0.0, 0.0],
            [1.22474487, 1.22474487],
        ])
        np.testing.assert_allclose(got, want, rtol=1e-6)

    def test_scores_by_purpose_uses_best_prompt_in_each_group(self):
        zscores = np.array([
            [1.0, 4.0, 2.0, 3.0],
            [8.0, 5.0, 7.0, 6.0],
        ])
        got = classifier.scores_by_purpose(
            zscores,
            {"personal": slice(0, 2), "wedding": slice(2, 4)},
            ("personal", "wedding"),
        )
        np.testing.assert_array_equal(got, np.array([[4.0, 3.0], [8.0, 7.0]]))

    def test_album_requires_median_and_majority_to_agree(self):
        scores = np.array([
            [3.0, 0.0],
            [2.0, 0.0],
            [0.0, 5.0],
        ])
        result = classifier.aggregate_album("album-1", scores, ("personal", "wedding"))
        self.assertEqual(result.candidate, "personal")
        self.assertFalse(result.conflict)
        self.assertAlmostEqual(result.majority_ratio, 2 / 3)

    def test_album_disagreement_is_kept_unclassified(self):
        scores = np.array([
            [100.0, 99.0],
            [100.0, 99.0],
            [1.0, 0.0],
            [0.0, 50.0],
            [0.0, 50.0],
        ])
        result = classifier.aggregate_album("album-1", scores, ("personal", "wedding"))
        self.assertIsNone(result.candidate)
        self.assertTrue(result.conflict)
        self.assertEqual(result.top_purpose, "wedding")

    def test_album_vote_tie_is_kept_unclassified(self):
        scores = np.array([[3.0, 0.0], [0.0, 3.0]])
        result = classifier.aggregate_album("album-1", scores, ("personal", "wedding"))
        self.assertIsNone(result.candidate)
        self.assertTrue(result.conflict)

    def test_calibrated_confidence_is_bounded_and_rewards_larger_margin(self):
        items = [
            classifier.AlbumEvidence("a", "personal", 0.1, 0.75, False, 4, (1.0, 0.9)),
            classifier.AlbumEvidence("b", "wedding", 0.8, 0.75, False, 4, (1.2, 0.4)),
        ]
        got = classifier.calibrate_evidence(items)
        self.assertTrue(all(0.0 <= item.confidence <= 1.0 for item in got))
        self.assertLess(got[0].confidence, got[1].confidence)

    def test_nonfinite_input_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "finite"):
            classifier.zscore_columns(np.array([[float("nan")]]))

    def test_catalog_groups_photos_by_album(self):
        rows = [
            {"id": "p1", "album_id": "a"},
            {"id": "p2", "album_id": "a"},
            {"id": "p3", "album_id": "b"},
        ]
        image_vectors = np.array([[1.0, 0.0], [1.0, 0.0], [0.0, 1.0]])
        text_vectors = np.array([[1.0, 0.0], [0.0, 1.0]])
        prompt_slices = {"personal": slice(0, 1), "wedding": slice(1, 2)}

        got = classifier.classify_catalog(
            rows,
            image_vectors,
            text_vectors,
            keys=("personal", "wedding"),
            prompt_slices=prompt_slices,
        )

        self.assertEqual([item.album_id for item in got], ["a", "b"])
        self.assertEqual([item.photo_count for item in got], [2, 1])

    def test_explicit_text_cannot_be_overturned_by_visual_friendship_score(self):
        text = TextEvidence(
            purpose="couple",
            candidates=("couple",),
            confidence=0.95,
            conflict=False,
            matches=({"source": "album_description", "purpose": "couple", "phrase": "커플 스냅"},),
        )
        image = classifier.AlbumPrediction(
            "album", "friendship", 0.43, False, 5, (2.1, 1.96), "friendship"
        )

        got = classifier.combine_prediction(text, image)

        self.assertEqual(got.purpose, "couple")
        self.assertEqual(got.source, "text")
        self.assertEqual(got.image_purpose, "friendship")

    def test_no_useful_text_falls_back_to_visual_top_purpose(self):
        text = TextEvidence(None, (), 0.0, False, ())
        image = classifier.AlbumPrediction(
            "album", None, 0.3, True, 4, (1.2, 1.1), "wedding"
        )

        got = classifier.combine_prediction(text, image)

        self.assertEqual(got.purpose, "wedding")
        self.assertEqual(got.source, "siglip")
        self.assertTrue(got.conflict)

    def test_ambiguous_text_listing_constrains_visual_choice(self):
        text = TextEvidence(None, ("couple", "friendship", "event"), 0.72, False, ())
        image = classifier.AlbumPrediction(
            "album",
            "pet",
            0.7,
            False,
            3,
            (2.0, 1.8),
            "pet",
            (("pet", 2.0), ("friendship", 1.8), ("couple", 1.5), ("event", 1.0)),
        )

        got = classifier.combine_prediction(text, image)

        self.assertEqual(got.purpose, "friendship")
        self.assertEqual(got.source, "hybrid")

    def test_unresolved_strong_text_conflict_stays_unclassified(self):
        text = TextEvidence(None, ("couple", "friendship"), 0.0, True, ())
        image = classifier.AlbumPrediction(
            "album", "couple", 0.99, False, 3, (2.0, 1.0), "couple"
        )

        got = classifier.combine_prediction(text, image)

        self.assertIsNone(got.purpose)
        self.assertEqual(got.source, "hybrid")
        self.assertTrue(got.conflict)


if __name__ == "__main__":
    unittest.main()

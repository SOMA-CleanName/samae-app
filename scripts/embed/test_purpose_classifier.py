import unittest

import numpy as np

from scripts.embed import purpose_classifier as classifier
from scripts.embed import purposes


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


if __name__ == "__main__":
    unittest.main()

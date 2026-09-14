import json
import tempfile
import unittest
from pathlib import Path

from scripts.embed.purpose_classifier import AlbumPrediction
from scripts.embed import purpose_backfill as backfill


def prediction(album_id, purpose="personal", confidence=0.9, conflict=False, photo_count=3):
    return AlbumPrediction(
        album_id=album_id,
        purpose=purpose,
        confidence=confidence,
        conflict=conflict,
        photo_count=photo_count,
        top_scores=(1.5, 0.5),
    )


class PurposeBackfillTest(unittest.TestCase):
    def setUp(self):
        self.calls = []

    def request(self, method, path, body=None, extra=None):
        self.calls.append((method, path, body, extra))
        return 3

    def test_dry_run_never_posts_to_rpc(self):
        result = backfill.apply_predictions(
            [prediction("a1")],
            request=self.request,
            apply=False,
            threshold=0.8,
            limit=None,
        )
        self.assertEqual(self.calls, [])
        self.assertEqual(result.processed, 1)

    def test_apply_calls_only_atomic_album_rpc(self):
        backfill.apply_predictions(
            [prediction("a1")],
            request=self.request,
            apply=True,
            threshold=0.8,
            limit=None,
        )
        self.assertEqual([(method, path) for method, path, _, _ in self.calls], [
            ("POST", "rpc/apply_siglip_album_purpose"),
        ])
        self.assertEqual(self.calls[0][2]["p_album_id"], "a1")
        self.assertEqual(self.calls[0][2]["p_purpose"], "personal")

    def test_threshold_leaves_low_confidence_purpose_null(self):
        backfill.apply_predictions(
            [prediction("a1", purpose="wedding", confidence=0.79)],
            request=self.request,
            apply=True,
            threshold=0.8,
            limit=None,
        )
        self.assertIsNone(self.calls[0][2]["p_purpose"])

    def test_manual_reviewed_album_is_excluded_before_classification(self):
        albums = [
            {"id": "a1", "admin_purpose_source": "manual", "admin_purpose_reviewed": True},
            {"id": "a2", "admin_purpose_source": None, "admin_purpose_reviewed": False},
        ]
        photos = [
            {"id": "p1", "album_id": "a1"},
            {"id": "p2", "album_id": "a2"},
        ]
        eligible, excluded = backfill.filter_eligible_rows(albums, photos)
        self.assertEqual([row["id"] for row in eligible], ["p2"])
        self.assertEqual(excluded, 1)

    def test_limit_caps_album_writes_not_photo_rows(self):
        backfill.apply_predictions(
            [prediction("a1", photo_count=40), prediction("a2", photo_count=1)],
            request=self.request,
            apply=True,
            threshold=0.8,
            limit=1,
        )
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0][2]["p_album_id"], "a1")

    def test_output_contains_json_csv_and_contact_sheet_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = backfill.write_artifacts(
                [prediction("a1")],
                albums_by_id={"a1": {"id": "a1", "title": "봄날"}},
                photos_by_album={"a1": [{"id": "p1", "thumb_url": None}]},
                output_dir=Path(directory),
                fetch_thumbnail=None,
            )
            names = sorted(path.name for path in paths)
            self.assertEqual(names, [
                "contact-sheet-manifest.json",
                "purpose-predictions.json",
                "purpose-summary.csv",
            ])
            manifest = json.loads((Path(directory) / "contact-sheet-manifest.json").read_text())
            self.assertEqual(manifest["albums"][0]["album_id"], "a1")


if __name__ == "__main__":
    unittest.main()

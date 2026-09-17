import json
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from scripts.embed.purpose_classifier import FinalPurposePrediction
from scripts.embed import purpose_backfill as backfill


def prediction(
    album_id,
    purpose="personal",
    confidence=0.9,
    conflict=False,
    photo_count=3,
    source="siglip",
):
    return FinalPurposePrediction(
        album_id=album_id,
        purpose=purpose,
        confidence=confidence,
        source=source,
        conflict=conflict,
        photo_count=photo_count,
        top_scores=(1.5, 0.5),
        image_purpose=purpose,
        evidence={"text_candidates": [], "text_matches": []},
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
            [prediction("a1", purpose="wedding")],
            request=self.request,
            apply=True,
            threshold=0.8,
            limit=None,
        )
        self.assertEqual([(method, path) for method, path, _, _ in self.calls], [
            ("POST", "rpc/apply_album_purpose_classification"),
        ])
        self.assertEqual(self.calls[0][2]["p_album_id"], "a1")
        self.assertEqual(self.calls[0][2]["p_purpose"], "wedding")
        self.assertEqual(self.calls[0][2]["p_source"], "siglip")
        self.assertEqual(self.calls[0][2]["p_evidence"], {
            "text_candidates": [], "text_matches": []
        })

    def test_threshold_leaves_low_confidence_purpose_null(self):
        backfill.apply_predictions(
            [prediction("a1", purpose="wedding", confidence=0.79)],
            request=self.request,
            apply=True,
            threshold=0.8,
            limit=None,
        )
        self.assertIsNone(self.calls[0][2]["p_purpose"])

    def test_visually_ambiguous_category_is_kept_for_manual_review(self):
        backfill.apply_predictions(
            [prediction("a1", purpose="pet", confidence=0.99)],
            request=self.request,
            apply=True,
            threshold=0.9,
            limit=None,
        )
        self.assertIsNone(self.calls[0][2]["p_purpose"])

    def test_force_all_assigns_median_winner_despite_conflict_and_confidence(self):
        forced = SimpleNamespace(
            album_id="a1",
            purpose=None,
            image_purpose="pet",
            source="siglip",
            confidence=0.01,
            conflict=True,
            photo_count=3,
            top_scores=(1.5, 0.5),
            evidence={},
        )
        result = backfill.apply_predictions(
            [forced],
            request=self.request,
            apply=True,
            threshold=0.9,
            limit=None,
            force_all=True,
        )
        self.assertEqual(result.classified, 1)
        self.assertEqual(result.unclassified, 0)
        self.assertEqual(self.calls[0][2]["p_purpose"], "pet")
        self.assertEqual(self.calls[0][2]["p_version"], "purpose-v4-text-first")

    def test_force_all_fetches_unpublished_compatible_photos(self):
        requested_paths = []

        def request(method, path, body=None, extra=None):
            requested_paths.append(path)
            if path.startswith("albums?"):
                return [{"id": "a1", "admin_purpose_source": None,
                         "admin_purpose_reviewed": False, "package_id": "pkg",
                         "target_category_id": "target"}]
            if path.startswith("album_admin_packages?"):
                return []
            if path.startswith("packages?"):
                return [{"id": "pkg", "name": "커플", "description": "커플 스냅"}]
            if path.startswith("categories?"):
                return [{"id": "target", "name": "커플·우정"}]
            if path.startswith("album_explore_categories?"):
                return [{"album_id": "a1", "explore_category_id": "explore"}]
            if path.startswith("explore_categories?"):
                return [{"id": "explore", "title": "데이트"}]
            if "offset=0" in path:
                return [{
                    "id": "p1",
                    "album_id": "a1",
                    "visibility": "private",
                    "embedding_model": backfill.EMBEDDING_PREFIX + "1024",
                    "title": "둘의 하루",
                    "caption": "커플 촬영",
                    "mood_tags": ["필름"],
                }]
            return []

        _, photos, _, _ = backfill.fetch_inputs(request, include_unpublished=True)
        photo_path = next(path for path in requested_paths if path.startswith("photos?"))
        self.assertNotIn("visibility=eq.published", photo_path)
        self.assertIn("album_id=not.is.null", photo_path)
        self.assertEqual([photo["id"] for photo in photos], ["p1"])

    def test_fetch_inputs_attaches_only_the_album_linked_package_and_categories(self):
        def request(method, path, body=None, extra=None):
            if path.startswith("albums?"):
                return [{"id": "a1", "package_id": "linked", "target_category_id": "target",
                         "admin_purpose_source": None, "admin_purpose_reviewed": False}]
            if path.startswith("photos?"):
                return [{"id": "p1", "album_id": "a1", "embedding": [1.0],
                         "embedding_model": backfill.EMBEDDING_PREFIX + "x",
                         "admin_purpose_source": None, "admin_purpose_reviewed": False,
                         "admin_purpose_overridden": False}]
            if path.startswith("packages?"):
                return [
                    {"id": "linked", "name": "커플", "description": "커플 스냅"},
                    {"id": "unlinked", "name": "웨딩", "description": "웨딩 스냅"},
                ]
            if path.startswith("categories?"):
                return [{"id": "target", "name": "커플·우정"}]
            if path.startswith("album_explore_categories?"):
                return [{"album_id": "a1", "explore_category_id": "explore"}]
            if path.startswith("explore_categories?"):
                return [{"id": "explore", "title": "데이트"}]
            return []

        albums, _, _, _ = backfill.fetch_inputs(request, include_unpublished=True)
        self.assertEqual(albums[0]["package"]["id"], "linked")
        self.assertEqual(albums[0]["target_category_name"], "커플·우정")
        self.assertEqual(albums[0]["explore_category_names"], ["데이트"])
        self.assertNotIn("unlinked", str(albums[0]))

    def test_internal_package_is_a_fallback_and_author_package_wins(self):
        def request(method, path, body=None, extra=None):
            if path.startswith("albums?"):
                return [
                    {"id": "internal", "package_id": None},
                    {"id": "author", "package_id": "author-pkg"},
                    {"id": "empty", "package_id": None},
                ]
            if path.startswith("album_admin_packages?"):
                return [
                    {"album_id": "internal", "package_id": "admin-pkg"},
                    {"album_id": "author", "package_id": "admin-pkg"},
                ]
            if path.startswith("packages?"):
                return [
                    {"id": "admin-pkg", "name": "개인", "description": "내부 지정"},
                    {"id": "author-pkg", "name": "웨딩", "description": "작가 지정"},
                ]
            return []

        albums, _, _, _ = backfill.fetch_inputs(request)
        by_id = {album["id"]: album for album in albums}
        self.assertEqual(by_id["internal"]["package"]["id"], "admin-pkg")
        self.assertIsNone(by_id["internal"]["package_id"])
        self.assertEqual(by_id["author"]["package"]["id"], "author-pkg")
        self.assertIsNone(by_id["empty"]["package"])

    def test_internal_package_evidence_is_not_published_with_classification(self):
        fields = backfill.build_text_fields({
            "package_is_internal": True,
            "package": {"name": "웨딩", "description": "웨딩 스냅"},
        }, [])
        self.assertEqual({field.source for field in fields}, {"internal_package_name", "internal_package_description"})
        item = prediction("a1", purpose="wedding", source="text")
        item.evidence["text_matches"] = [
            {"source": "internal_package_name", "phrase": "웨딩", "purpose": "wedding"},
            {"source": "album_description", "phrase": "웨딩", "purpose": "wedding"},
        ]
        backfill.apply_predictions([item], request=self.request, apply=True, threshold=0.8, limit=None)
        saved = self.calls[0][2]["p_evidence"]
        self.assertEqual([match["source"] for match in saved["text_matches"]], ["album_description"])
        self.assertEqual(len(item.evidence["text_matches"]), 2)

    def test_album_text_fields_include_all_approved_author_sources(self):
        fields = backfill.build_text_fields(
            {
                "title": "포트폴리오 제목",
                "description": "포트폴리오 설명",
                "package": {"name": "패키지명", "description": "패키지 설명"},
                "target_category_name": "커플·우정",
                "explore_category_names": ["데이트"],
            },
            [{"title": "사진 제목", "caption": "사진 설명", "mood_tags": ["필름", "커플"]}],
        )
        self.assertEqual(
            {(item.source, item.text, item.priority) for item in fields},
            {
                ("photo_title", "사진 제목", 5),
                ("photo_caption", "사진 설명", 5),
                ("album_title", "포트폴리오 제목", 4),
                ("album_description", "포트폴리오 설명", 4),
                ("target_category", "커플·우정", 3),
                ("explore_category", "데이트", 3),
                ("package_name", "패키지명", 2),
                ("package_description", "패키지 설명", 2),
                ("hashtags", "필름 커플", 1),
            },
        )

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

    def test_manual_and_overridden_photos_are_excluded_from_force_all_input(self):
        photos = [
            {"id": "manual", "album_id": None, "admin_purpose_source": "manual"},
            {"id": "reviewed", "album_id": None, "admin_purpose_reviewed": True},
            {"id": "override", "album_id": "a1", "admin_purpose_overridden": True},
            {"id": "eligible", "album_id": "a1"},
        ]
        eligible, excluded = backfill.filter_eligible_rows([], photos)
        self.assertEqual([row["id"] for row in eligible], ["eligible"])
        self.assertEqual(excluded, 3)

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

    def test_daily_reconsiders_thresholded_legacy_results_and_metadata_changes(self):
        version = "purpose-v5-daily"
        now = "2026-09-15T06:00:00+09:00"
        albums = [{"id": "a", "admin_purpose_version": version, "admin_purpose_at": now, "updated_at": now}]
        photos = [{"id": "p", "album_id": "a", "admin_purpose_version": version, "admin_purpose_at": now, "updated_at": now}]
        self.assertEqual(backfill.pending_album_ids(albums, photos), set())
        for key in ("updated_at", "package_updated_at", "package_assigned_at"):
            self.assertEqual(backfill.pending_album_ids([{**albums[0], key: "2026-09-14T21:00:01Z"}], photos), {"a"})
        self.assertEqual(backfill.pending_album_ids(albums, [{**photos[0], "updated_at": "2026-09-14T21:00:01Z"}]), {"a"})
        self.assertEqual(backfill.pending_album_ids([{**albums[0], "admin_purpose_version": backfill.purposes.TEXT_FIRST_VERSION}], photos), {"a"})

    def test_limit_prioritizes_highest_confidence_portfolios(self):
        backfill.apply_predictions(
            [
                prediction("low", purpose="wedding", confidence=0.91),
                prediction("high", purpose="event", confidence=1.0),
            ],
            request=self.request,
            apply=True,
            threshold=0.9,
            limit=1,
        )
        self.assertEqual(self.calls[0][2]["p_album_id"], "high")

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
            prediction_json = json.loads((Path(directory) / "purpose-predictions.json").read_text())
            self.assertEqual(prediction_json[0]["source"], "siglip")
            self.assertEqual(prediction_json[0]["evidence"]["text_candidates"], [])
            csv_header = (Path(directory) / "purpose-summary.csv").read_text(
                encoding="utf-8-sig"
            ).splitlines()[0]
            self.assertIn("source", csv_header)


class DailyPurposeBackfillTest(unittest.TestCase):
    def run_daily(self, albums, photos, *, fail_write=False):
        calls = []
        def fetch(request, *, include_unpublished=False, reference_rows=None):
            self.assertFalse(include_unpublished)
            if reference_rows is not None:
                reference_rows.extend(photos)
            eligible, excluded = backfill.filter_eligible_rows(albums, photos)
            return albums, eligible, excluded, 0
        def api(env, method, path, body=None, extra=None):
            calls.append((method, path, body))
            if path == "rpc/backfill_inherited_photo_purposes":
                return 0
            if fail_write:
                raise RuntimeError("simulated database failure")
            return 1
        text_vectors = np.random.default_rng(7).normal(size=(56, 1152))
        text_vectors /= np.linalg.norm(text_vectors, axis=1, keepdims=True)
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(sys, "argv", ["purpose_backfill.py", "--daily", "--apply", "--output", directory]), \
             patch.object(backfill, "load_env", return_value={"PERSONA_SERVICE_TOKEN": "test-token"}), \
             patch.object(backfill, "api_request", side_effect=api), \
             patch.object(backfill, "fetch_inputs", side_effect=fetch), \
             patch.object(backfill, "BackfillClient", create=True) as client, \
             patch.object(backfill.siglip, "load", side_effect=AssertionError("must use resident server")), \
             contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            client.return_value.embed_texts.return_value = text_vectors.tolist()
            code = backfill.main()
            return code, calls, client.call_count

    def photo(self, id, album_id, **changes):
        return {"id": id, "album_id": album_id, "embedding": [1.] + [0.] * 1151,
                "admin_purpose_version": "purpose-v5-daily", **changes}

    def test_completed_catalog_is_a_successful_noop_without_loading_a_model(self):
        code, calls, clients = self.run_daily(
            [{"id": "done", "admin_purpose_version": "purpose-v5-daily"}],
            [self.photo("done-photo", "done")],
        )
        self.assertEqual(code, 0)
        self.assertEqual(clients, 0)
        self.assertEqual([call[1] for call in calls], ["rpc/backfill_inherited_photo_purposes"])

    def test_one_new_photo_is_classified_once_and_reviewed_albums_are_never_written(self):
        code, calls, clients = self.run_daily(
            [{"id": "new", "admin_purpose_version": "purpose-v5-daily"},
             {"id": "reviewed", "admin_purpose_reviewed": True}],
            [self.photo("new-photo", "new", admin_purpose_version=None),
             self.photo("reference", "reviewed", embedding=[0., 1.] + [0.] * 1150)],
        )
        self.assertEqual(code, 0)
        self.assertEqual(clients, 1)
        writes = [call[2] for call in calls if call[1] == "rpc/apply_album_purpose_classification"]
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0]["p_album_id"], "new")
        self.assertEqual(writes[0]["p_version"], "purpose-v5-daily")
        self.assertIn(writes[0]["p_purpose"], backfill.purposes.PURPOSE_KEYS)

    def test_first_ever_single_photo_can_receive_one_purpose(self):
        code, calls, _ = self.run_daily([{"id": "new"}], [self.photo("only", "new", admin_purpose_version=None)])
        self.assertEqual(code, 0)
        self.assertIn(calls[-1][2]["p_purpose"], backfill.purposes.PURPOSE_KEYS)

    def test_partial_rpc_failure_produces_failure_exit_status(self):
        code, _, _ = self.run_daily([{"id": "new"}], [self.photo("only", "new", admin_purpose_version=None)], fail_write=True)
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()

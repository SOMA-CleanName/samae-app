import json
import tempfile
import unittest
from pathlib import Path

from build_mood_priority_pool import build as build_pool
from compile_mood_review import parse
from sample_mood_review import build as build_sample

INDEX = {"1": {"candidate_id": "c1", "label": "부드럽다",
               "senses": [{"source_id": "s", "entry_key": "1", "sense_id": "1"},
                          {"source_id": "s", "entry_key": "1", "sense_id": "2"}]},
         "2": {"candidate_id": "c2", "label": "몽환적인", "senses": []}}
OK = ("1\tmood\t질감\t감정\ts1,s2\t표면이 매끄러운 사진\t뜻풀이 근거\n"
      "2\tmood\t스타일\t-\t-\t비현실적인 사진\t편집 시드 근거\n")


class CompileMoodReviewTest(unittest.TestCase):
    def rows(self, text):
        rows, errors = parse(text, INDEX)
        return rows, errors

    def test_accepts_complete_review_and_resolves_cited_senses(self):
        rows, errors = self.rows(OK)
        self.assertEqual(errors, [])
        self.assertEqual(rows[0]["axis"], "질감")
        self.assertEqual(rows[0]["evidence"]["secondary_axes"], ["감정"])
        self.assertEqual([s["sense_id"] for s in rows[0]["evidence"]["applicable_senses"]], ["1", "2"])
        # A mood may cite no sense only where the candidate has no definition at all.
        self.assertEqual(rows[1]["evidence"]["applicable_senses"], [])
        self.assertTrue(all(r["evidence"]["needs_review"] for r in rows))
        self.assertTrue(all(r["evidence"]["human_review_status"] == "not_reviewed" for r in rows))

    def test_rejects_sense_that_was_never_shown(self):
        _, errors = self.rows(OK.replace("s1,s2", "s1,s9"))
        self.assertTrue(any("sense s9 does not exist" in e for e in errors))

    def test_rejects_invalid_axis_missing_item_duplicate_and_axis_on_non_mood(self):
        _, errors = self.rows("1\tmood\t밝기\t-\ts1\t사진\t근거\n2\tmood\t스타일\t-\t-\t사진\t근거\n")
        self.assertTrue(any("invalid primary axis" in e for e in errors))
        _, errors = self.rows("1\tmood\t질감\t-\ts1\t사진\t근거\n")
        self.assertTrue(any("were not reviewed" in e for e in errors))
        _, errors = self.rows(OK + "1\tgeneral\t-\t-\t-\t-\t근거\n")
        self.assertTrue(any("duplicate item" in e for e in errors))
        _, errors = self.rows("1\tgeneral\t질감\t-\t-\t-\t근거\n2\tmood\t스타일\t-\t-\t사진\t근거\n")
        self.assertTrue(any("must not carry an axis" in e for e in errors))

    def test_rejects_mood_without_photo_usage_or_reason(self):
        _, errors = self.rows(OK.replace("표면이 매끄러운 사진", "-"))
        self.assertTrue(any("mood needs a photo usage" in e for e in errors))
        _, errors = self.rows(OK.replace("뜻풀이 근거", "-"))
        self.assertTrue(any("reason required" in e for e in errors))


class SampleMoodReviewTest(unittest.TestCase):
    def test_sample_is_deterministic_and_keeps_required_cases_without_touching_candidates(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder)
            candidates = [{"id": f"id{i:03d}", "label": f"말{i}", "axis": "unassigned",
                           "english_prompt": None, "selection_status": "collected",
                           "selection_basis": "x"} for i in range(5)]
            candidates.append({"id": "idsoft", "label": "부드럽다", "axis": "unassigned",
                               "english_prompt": None, "selection_status": "collected", "selection_basis": "x"})
            (out / "collection.json").write_text(json.dumps({
                "sources": [{"id": "krdict-mirror:r", "revision": "r"}], "candidates": candidates,
                "entries": [{"source_id": "krdict-mirror:r", "entry_key": "9",
                             "candidate_id": "idsoft", "metadata": {}}]}), encoding="utf-8")
            (out / "classification.json").write_text(json.dumps({"rows": [
                {"candidate_id": c["id"], "kind": "pending", "axis": None, "rule": "r"} for c in candidates]}),
                encoding="utf-8")
            (out / "senses.json").write_text(json.dumps({"source_id": "krdict-mirror:r", "revision": "r",
                "entries": {"9": [{"label": "부드럽다", "metadata": {"partOfSpeech": "형용사"},
                                   "senses": [{"sense_id": "1", "definition": "매끄럽다"}]}]}}), encoding="utf-8")
            first, second = build_sample(out), build_sample(out)
            self.assertEqual([i["candidate_id"] for i in first["items"]],
                             [i["candidate_id"] for i in second["items"]])
            required = [i for i in first["items"] if i["label"] == "부드럽다"]
            self.assertEqual(required[0]["stratum"], "required")
            self.assertEqual(required[0]["dictionary"][0]["senses"][0]["definition"], "매끄럽다")
            # Sampling reads candidates; it never rewrites their axis or selection status.
            self.assertTrue(all(c["axis"] == "unassigned" for c in candidates))
            self.assertTrue(all(c["selection_status"] == "collected" for c in candidates))


def write_fixture(out, candidates, entries, senses, classification=None):
    (out / "collection.json").write_text(json.dumps({
        "sources": [{"id": "krdict-mirror:r", "revision": "r"}],
        "candidates": candidates, "entries": entries}), encoding="utf-8")
    (out / "classification.json").write_text(json.dumps({"rows": classification or [
        {"candidate_id": c["id"], "kind": "pending", "axis": None, "rule": "r"} for c in candidates]}),
        encoding="utf-8")
    (out / "senses.json").write_text(json.dumps({"source_id": "krdict-mirror:r", "revision": "r",
                                                 "entries": senses}), encoding="utf-8")


class PriorityPoolTest(unittest.TestCase):
    def pool(self, senses, decided=None):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder)
            candidates = [{"id": f"id{n}", "label": label, "axis": "unassigned", "english_prompt": None,
                           "selection_status": "collected", "selection_basis": "x"}
                          for n, label in enumerate(senses, 1)]
            write_fixture(out, candidates,
                          [{"source_id": "krdict-mirror:r", "entry_key": str(n), "candidate_id": f"id{n}",
                            "metadata": {}} for n in range(1, len(candidates) + 1)],
                          {str(n): [dict(entry, label=label)]
                           for n, (label, entry) in enumerate(senses.items(), 1)})
            if decided:
                (out / "classification-v2.json").write_text(json.dumps({"rows": decided}), encoding="utf-8")
            return build_pool(out)

    SENSES = {
        "부드럽다": {"metadata": {"partOfSpeech": "형용사", "semanticCategory": "개념 > 성질"},
                 "senses": [{"sense_id": "1", "definition": "매끄럽다"}]},
        "빨간색": {"metadata": {"partOfSpeech": "명사", "semanticCategory": "개념 > 색깔"},
                "senses": [{"sense_id": "1", "definition": "사과와 같은 색"}]},
        "도서관": {"metadata": {"partOfSpeech": "명사", "semanticCategory": "교육 > 학교 시설"},
                "senses": [{"sense_id": "1", "definition": "책을 모아 둔 시설"}]},
        "몽환적인": {"metadata": {}, "senses": []},
    }

    def test_keeps_modifiers_and_mood_categories_but_drops_plain_nouns(self):
        pool = self.pool(self.SENSES)
        labels = {i["label"] for i in pool["items"]}
        self.assertEqual(labels, {"부드럽다", "빨간색"})
        self.assertEqual(pool["skipped"]["수식어도 무드 범주도 아님"], 1)
        admitted = {i["label"]: i["admitted_by"] for i in pool["items"]}
        self.assertEqual(admitted["부드럽다"]["modifiers"], ["형용사"])
        self.assertEqual(admitted["빨간색"]["categories"], ["개념 > 색깔"])

    def test_skips_candidates_without_definitions_and_ones_already_decided(self):
        pool = self.pool(self.SENSES)
        self.assertEqual(pool["skipped"]["뜻풀이 없음"], 1)          # 몽환적인 has no senses
        decided = self.pool(self.SENSES, decided=[{"candidate_id": "id1"}])
        self.assertEqual({i["label"] for i in decided["items"]}, {"빨간색"})
        self.assertEqual(decided["skipped"]["이미 판단함"], 1)

    def test_pool_is_deterministic_and_renderable_like_the_pilot(self):
        first, second = self.pool(self.SENSES), self.pool(self.SENSES)
        self.assertEqual([i["candidate_id"] for i in first["items"]],
                         [i["candidate_id"] for i in second["items"]])
        for item in first["items"]:
            self.assertEqual(set(item) >= {"candidate_id", "label", "v1", "dictionary", "other_sources",
                                           "stratum", "selection_reason"}, True)


if __name__ == "__main__":
    unittest.main()

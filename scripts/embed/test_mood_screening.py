import json
import tempfile
import unittest
from pathlib import Path

from compile_mood_screening import compile_rows, parse
from render_mood_review import render

INDEX = {"1": {"candidate_id": "c1", "label": "씁쓰름하다", "senses": []},
         "2": {"candidate_id": "c2", "label": "쌉쌀하다", "senses": []},
         "3": {"candidate_id": "c3", "label": "수려하다", "senses": []}}
OK = ("1\tY\t기분이 썩 좋지 않다는 뜻이 정서를 서술한다\n"
      "2\tN\t맛 뜻만 있고 분위기로 옮겨지는 뜻풀이가 없다\n"
      "3\t?\t아름다움 전반이라 현재 축에 대응이 없다\n")

POOL = {"items": [{"candidate_id": "c1", "label": "기능성", "existing_axis": "unassigned",
                   "selection_status": "collected", "stratum": "P-우선 구간", "selection_reason": "r",
                   "v1": {"kind": "pending", "axis": None, "rule": "semantic_category_not_specific_enough"},
                   "dictionary": [{"source_id": "s", "entry_key": "37837", "label": "기능성",
                                   "metadata": {"partOfSpeech": "명사", "semanticCategory": "개념 > 성질",
                                                "vocabularyLevel": "고급", "lexicalUnit": "단어"},
                                   "senses": [{"sense_id": "1", "definition": "제 기능을 발휘할 수 있는 성질."}],
                                   "join": "source_row"}],
                   "other_sources": [{"source_id": "knu:x", "entry_key": "9", "metadata": {"polarity": -1}}]}]}


class ScreeningRenderTest(unittest.TestCase):
    def test_screening_render_drops_the_old_verdict_entry_ids_and_polarity(self):
        lean, index = render(POOL, screening=True)
        self.assertIn("[001] 기능성", lean)
        self.assertIn("제 기능을 발휘할 수 있는 성질.", lean)
        for noise in ("v1=", "기존축=", "37837", "source_row", "KNU", "고급"):
            self.assertNotIn(noise, lean)
        self.assertEqual(index["1"]["candidate_id"], "c1")

    def test_full_render_still_carries_what_axis_assignment_needs(self):
        full, _ = render(POOL)
        for kept in ("v1=", "기존축=", "37837", "source_row", "KNU"):
            self.assertIn(kept, full)

    def test_screening_render_keeps_an_editorial_axis_and_description(self):
        pool = json.loads(json.dumps(POOL))
        pool["items"][0]["existing_axis"] = "스타일"
        pool["items"][0]["other_sources"] = [{"source_id": "editorial:x", "entry_key": "1",
                                              "metadata": {"description": "dreamy"}}]
        lean, _ = render(pool, screening=True)
        self.assertIn("기존축=스타일", lean)
        self.assertIn("[편집] dreamy", lean)


class ScreeningCompileTest(unittest.TestCase):
    def test_accepts_all_three_verdicts_and_splits_out_the_accepted_set(self):
        rows, errors = parse(OK, INDEX)
        self.assertEqual(errors, [])
        self.assertEqual([r["verdict"] for r in rows], ["mood", "not_mood", "undecided"])
        data = compile_rows(rows)
        self.assertEqual(data["counts"], {"mood": 1, "not_mood": 1, "undecided": 1})
        # Screening must not invent an axis anywhere in its output.
        self.assertNotIn("axis", json.dumps(data))

    def test_rejects_unknown_verdict_missing_item_duplicate_and_empty_reason(self):
        _, errors = parse(OK.replace("1\tY", "1\tmood"), INDEX)
        self.assertTrue(any("verdict must be Y, N or ?" in e for e in errors))
        _, errors = parse("1\tY\t근거\n", INDEX)
        self.assertTrue(any("were not screened" in e for e in errors))
        _, errors = parse(OK + "1\tN\t다시\n", INDEX)
        self.assertTrue(any("duplicate item" in e for e in errors))
        _, errors = parse(OK.replace("아름다움 전반이라 현재 축에 대응이 없다", "-"), INDEX)
        self.assertTrue(any("reason required" in e for e in errors))
        _, errors = parse(OK + "9\tY\t근거\n", INDEX)
        self.assertTrue(any("unknown item" in e for e in errors))

    def test_rejects_one_candidate_screened_twice_under_different_numbers(self):
        index = dict(INDEX, **{"4": {"candidate_id": "c1", "label": "씁쓰름하다", "senses": []}})
        _, errors = parse(OK + "4\tN\t같은 후보를 다시\n", index)
        self.assertTrue(any("several positions" in e for e in errors))


if __name__ == "__main__":
    unittest.main()

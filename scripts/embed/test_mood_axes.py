import json
import tempfile
import unittest
from pathlib import Path

from build_mood_axis_input import prepare, render, load_verdicts
from compile_mood_axes import parse, summarise

BUNDLE = {
    "groups": [
        {"head": "황혼", "level": 1, "members": ["해거름", "저물녘"], "prompts": ["dusk glow"]},
        {"head": "깜박이다", "level": 1, "members": ["명멸"], "prompts": ["blinking on and off"]},
        {"head": "주접", "level": 2, "members": [], "prompts": ["shabby and unkempt"]},
    ],
    "senses": {
        "황혼": {"pos": "명사", "level": 1, "senses": ["해가 지고 어스름해질 때", "한창인 때가 지나 쇠퇴한 상태"]},
        "깜박이다": {"pos": "동사", "level": 0, "senses": ["불빛이 잠깐 나타났다 사라졌다 하다"]},
        "주접": {"pos": "명사", "level": 2, "senses": ["옷차림이 초라하고 너절한 것"]},
        "해거름": {"pos": "명사", "level": 2, "senses": ["해가 서쪽으로 넘어가는 때"]},
    },
}
INDEX = {
    "1": {"head": "황혼", "members": ["해거름", "저물녘"], "prompts": ["dusk glow"],
          "senses": ["해가 지고 어스름해질 때", "한창인 때가 지나 쇠퇴한 상태"]},
    "2": {"head": "주접", "members": [], "prompts": ["shabby and unkempt"], "senses": []},
}
OK = ("1|||시간대,빛|||s1|||해 질 무렵 붉게 물든 하늘|||해가 지는 때이면서 그때의 빛을 함께 가리킨다\n"
      "2|||스타일|||-|||옷차림이 너절한 사람|||겉모습의 매무새를 말한다\n")


class BuildAxisInputTest(unittest.TestCase):
    def test_numbers_senses_per_head_and_carries_members_for_context(self):
        text, index = render(prepare(BUNDLE, {}), BUNDLE["senses"])
        self.assertIn("[0001] 황혼  |  식구 2  |  dusk glow", text)
        self.assertIn("     s1. 해가 지고 어스름해질 때", text)
        self.assertIn("     s2. 한창인 때가 지나 쇠퇴한 상태", text)
        self.assertIn("   · 식구: 해거름 · 저물녘", text)
        # 식구의 뜻풀이는 번호를 매기지 않는다 — 축 판단의 근거는 대표의 뜻이다.
        self.assertNotIn("해가 서쪽으로 넘어가는 때", text)
        self.assertEqual(index["1"]["senses"], BUNDLE["senses"]["황혼"]["senses"])
        self.assertEqual(index["1"]["members"], ["해거름", "저물녘"])

    def test_numbering_stays_global_when_a_slice_is_rendered(self):
        groups = prepare(BUNDLE, {})
        text, index = render(groups[1:], BUNDLE["senses"], start=2)
        self.assertIn("[0002] 깜박이다", text)
        self.assertEqual(sorted(index), ["2", "3"], "조각마다 1번부터 매기면 합칠 때 번호가 겹친다")

    def test_graph_review_is_applied(self):
        verdicts = {"황혼": {"status": "head", "head": "해거름"},
                    "주접": {"status": "drop"},
                    "깜박이다": {"note": "명멸은 빛이 깜빡이는 것인데"}}
        groups = prepare(BUNDLE, verdicts)
        self.assertEqual([g["head"] for g in groups], ["해거름", "깜박이다"], "버림은 빠지고 대표 변경은 반영된다")
        self.assertIn("황혼", groups[0]["members"], "대표에서 내려온 낱말은 식구로 남는다")
        text, _ = render(groups, BUNDLE["senses"])
        self.assertIn("   · 검수 메모: 명멸은 빛이 깜빡이는 것인데", text, "메모는 답할 자리에 다시 보여야 한다")

    def test_missing_verdict_file_is_not_an_error(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(load_verdicts(Path(directory) / "head-review.json"), {})


class CompileMoodAxesTest(unittest.TestCase):
    def test_accepts_equal_axes_and_resolves_cited_senses(self):
        rows, errors = parse(OK, INDEX)
        self.assertEqual(errors, [])
        self.assertEqual(rows[0]["axes"], ["시간대", "빛"], "두 축은 대등하다 — 대표축이 따로 없다")
        self.assertEqual(rows[0]["cited_senses"], ["해가 지고 어스름해질 때"])
        self.assertEqual(rows[0]["members"], ["해거름", "저물녘"], "식구는 대표를 따라간다")
        # 뜻풀이가 없는 항목만 sense 를 생략할 수 있다.
        self.assertEqual(rows[1]["cited_senses"], [])

    def test_rejects_sense_that_was_never_shown(self):
        _, errors = parse(OK.replace("|||s1|||", "|||s1,s9|||"), INDEX)
        self.assertTrue(any("sense s9 does not exist" in e for e in errors))

    def test_rejects_unknown_axis_empty_axis_and_repeats(self):
        _, errors = parse(OK.replace("시간대,빛", "밝기"), INDEX)
        self.assertTrue(any("invalid axis '밝기'" in e for e in errors))
        _, errors = parse(OK.replace("시간대,빛", "-"), INDEX)
        self.assertTrue(any("at least one axis is required" in e for e in errors))
        _, errors = parse(OK.replace("시간대,빛", "빛,빛"), INDEX)
        self.assertTrue(any("duplicate axes" in e for e in errors))

    def test_rejects_missing_duplicate_and_unknown_items(self):
        _, errors = parse(OK.splitlines()[0] + "\n", INDEX)
        self.assertTrue(any("were not assigned" in e for e in errors))
        _, errors = parse(OK + OK.splitlines()[0] + "\n", INDEX)
        self.assertTrue(any("duplicate item 1" in e for e in errors))
        _, errors = parse(OK + "9|||빛|||-|||사진|||근거\n", INDEX)
        self.assertTrue(any("unknown item '9'" in e for e in errors))

    def test_rejects_missing_usage_reason_or_uncited_sense(self):
        _, errors = parse(OK.replace("해 질 무렵 붉게 물든 하늘", "-"), INDEX)
        self.assertTrue(any("photo usage required" in e for e in errors))
        _, errors = parse(OK.replace("해가 지는 때이면서 그때의 빛을 함께 가리킨다", "-"), INDEX)
        self.assertTrue(any("reason required" in e for e in errors))
        _, errors = parse(OK.replace("시간대,빛|||s1", "시간대,빛|||-"), INDEX)
        self.assertTrue(any("must cite a sense when definitions exist" in e for e in errors))

    def test_rejects_wrong_field_count_and_accepts_bracketed_numbers(self):
        _, errors = parse("1|||빛|||s1|||사진\n", INDEX)
        self.assertTrue(any("expected 5 fields" in e for e in errors))
        rows, errors = parse(OK.replace("1|||시간대", "[0001]|||시간대"), INDEX)
        self.assertEqual(errors, [], "입력 텍스트의 [0001] 을 그대로 붙여넣어도 받는다")
        self.assertEqual(rows[0]["position"], 1)

    def test_summary_shows_whether_multiple_axes_were_actually_used(self):
        rows, _ = parse(OK, INDEX)
        counts = summarise(rows)
        self.assertEqual(counts["heads"], 2)
        self.assertEqual(counts["words_covered"], 4, "대표 2 + 식구 2")
        self.assertEqual(counts["axes_per_head"], {"1": 1, "2": 1})
        self.assertEqual(counts["per_axis"]["빛"], 1)


if __name__ == "__main__":
    unittest.main()

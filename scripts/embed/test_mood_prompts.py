import unittest

from build_mood_prompts import clean, messages, render


class PromptRenderTest(unittest.TestCase):
    def test_render_carries_the_word_and_its_senses(self):
        text = render("그윽이", ["느낌이 깊고 평안하게.", "인상이 은근하게."])
        self.assertIn("word: 그윽이", text)
        self.assertIn("- 느낌이 깊고 평안하게.", text)
        self.assertIn("- 인상이 은근하게.", text)

    def test_render_caps_the_sense_list_so_a_17_sense_entry_cannot_flood_the_prompt(self):
        text = render("차다", [f"뜻 {i}." for i in range(17)])
        self.assertEqual(text.count("\n- "), 4)
        self.assertNotIn("뜻 5.", text)

    def test_messages_teach_by_example_that_a_literal_gloss_is_wrong(self):
        msgs = messages("소복이", ["볼록하게 많이."])
        self.assertEqual(msgs[0]["role"], "system")
        self.assertEqual(msgs[-1]["role"], "user")
        # 그윽이 -> deeply and serenely 가 예시로 들어가야 직역을 막는다
        self.assertIn("deeply and serenely", [m["content"] for m in msgs])
        self.assertEqual(sum(m["role"] == "assistant" for m in msgs), 4)


class PromptCleanTest(unittest.TestCase):
    def test_clean_drops_a_think_block_quotes_and_the_trailing_period(self):
        self.assertEqual(clean('<think>고민</think> "heaped up thickly."'), "heaped up thickly")

    def test_clean_collapses_whitespace_so_the_tsv_cannot_gain_a_column(self):
        self.assertEqual(clean("  deep\t dark   blue \n"), "deep dark blue")


if __name__ == "__main__":
    unittest.main()

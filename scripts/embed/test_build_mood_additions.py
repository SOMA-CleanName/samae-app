import unittest

from build_mood_additions import collect, norm


class CollectTest(unittest.TestCase):
    def test_known_words_are_skipped_and_sources_merge(self):
        known = {norm("조용한"), norm("예쁜")}
        entries = collect(
            [{"label": "힙한", "axis": "스타일", "english_prompt": "trendy street style"},
             {"label": "조용한", "axis": "감정"}],
            [{"label": "힙한 ", "axes": ["스타일", "에너지"], "kind": "신조어", "usage": "스트리트 느낌"},
             {"label": "필름  감성", "axes": ["스타일"], "kind": "구절", "usage": "입자감"},
             {"label": "예쁜", "axes": ["스타일"], "kind": "기타"}],
            known)
        by = {e["label"]: e for e in entries}
        self.assertEqual(sorted(by), ["필름 감성", "힙한"], "새 어휘에 있는 말은 뺀다 · 공백은 하나로")
        self.assertEqual(by["힙한"]["sources"], ["shortlisted", "generated"])
        self.assertEqual(by["힙한"]["axes"], ["스타일", "에너지"])
        self.assertEqual(by["힙한"]["usage"], "스트리트 느낌", "용례는 있는 쪽에서")
        self.assertEqual(by["힙한"]["prompt"], "trendy street style")


if __name__ == "__main__":
    unittest.main()

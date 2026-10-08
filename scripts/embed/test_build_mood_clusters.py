import unittest

from build_mood_clusters import build

HEADS = {"깜박이다", "껌벅하다", "끔벅이다", "주황", "주황색", "노을"}


def r(id, members, rep, at="2026-09-21T00:00:0{}Z", verdict="group", n=0):
    return {"id": id, "verdict": verdict, "members": members, "rep": rep, "at": at.format(n)}


class BuildTest(unittest.TestCase):
    def test_overlapping_decisions_join_into_one_cluster(self):
        out = build([r("r1", ["깜박이다", "껌벅하다"], "깜박이다", n=1),
                     r("r2", ["껌벅하다", "끔벅이다"], "껌벅하다", n=2)], HEADS)
        self.assertEqual(out, [{"id": "m001", "members": ["깜박이다", "껌벅하다", "끔벅이다"]}],
                         "두 번 다 거의 같다고 했으니 하나로 — 대표는 없다")

    def test_last_verdict_wins_and_keep_removes(self):
        out = build([r("s1", ["주황", "주황색"], "주황", n=1),
                     {"id": "s1", "verdict": "keep", "at": "2026-09-21T00:00:05Z"}], HEADS)
        self.assertEqual(out, [])

    def test_unknown_groups_are_ignored(self):
        out = build([r("s1", ["주황", "없는묶음"], "주황", n=1)], HEADS)
        self.assertEqual(out, [], "남는 게 하나뿐이면 무리가 아니다")

    def test_ai_decisions_apply_unless_a_person_overrides(self):
        cases = [{"id": "s1", "ai": {"verdict": "group", "members": ["주황", "주황색"]}},
                 {"id": "r1", "ai": {"verdict": "unsure"}, "groups": []}]
        self.assertEqual(build([], HEADS, cases), [{"id": "m001", "members": ["주황", "주황색"]}])
        overridden = build([{"id": "s1", "verdict": "keep", "at": "2026-09-21T01:00:00Z"}], HEADS, cases)
        self.assertEqual(overridden, [], "사람 판정이 덮는다")

    def test_unsure_is_not_a_cluster_until_decided(self):
        cases = [{"id": "r1", "ai": {"verdict": "unsure", "why": "사진이 갈릴 수 있음"}}]
        self.assertEqual(build([], HEADS, cases), [])


if __name__ == "__main__":
    unittest.main()

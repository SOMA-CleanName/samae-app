import unittest

from build_search_tags import build


class BuildSearchTagsTest(unittest.TestCase):
    def test_keeps_approved_photographers_and_collects_used_albums_once(self):
        photos = [
            {"id": "p1", "album_id": "a1", "photographer_id": "g1", "mood_tags": ["몽환"], "created_at": "x"},
            {"id": "p2", "album_id": "a1", "photographer_id": "g1", "mood_tags": [], "created_at": "x"},
            {"id": "p3", "album_id": "a2", "photographer_id": "g2", "mood_tags": [], "created_at": "x"},  # 미승인 작가
            {"id": "p4", "album_id": None, "photographer_id": "g1", "mood_tags": [], "created_at": "x"},
        ]
        albums = [{"id": a, "title": a, "description": "", "location_text": None} for a in ("a1", "a2", "a3")]
        photographers = [{"id": "g1", "display_name": "도토리", "regions": [], "mood_tags": ["몽환"]}]

        got = build(photos, albums, photographers)

        self.assertEqual([p["id"] for p in got["photos"]], ["p1", "p2", "p4"])   # 순서 그대로
        self.assertNotIn("created_at", got["photos"][0])
        self.assertEqual(set(got["albums"]), {"a1"})                             # 쓰이는 앨범만, 한 번
        self.assertEqual(got["photographers"], {"g1": {"display_name": "도토리", "regions": [], "mood_tags": ["몽환"]}})


if __name__ == "__main__":
    unittest.main()

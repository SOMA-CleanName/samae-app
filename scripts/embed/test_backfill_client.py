import base64
import contextlib
import copy
import importlib
import io
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

backfill = importlib.import_module("scripts.embed.embed_photos")
MODEL = "google/siglip2-so400m-patch16-naflex"


class BackfillClientTest(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.responses = []
        self.health = {"ok": True, "model": MODEL, "dim": 1152, "patch_budget": 256,
                       "inference_queue": {"running": None, "waiting": {"search": 0, "interactive": 0, "backfill": 0}}}
        self.vector = {"model": MODEL, "dim": 1152, "patch_budget": 256, "count": 1,
                       "infer_ms": 12.3, "vectors": [[1.0] + [0.0] * 1151]}
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                owner.requests.append((self.path, self.headers.get("x-samae-token"), None))
                self.send(200, owner.health)

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                owner.requests.append((self.path, self.headers.get("x-samae-token"), body))
                code, payload = owner.responses.pop(0) if owner.responses else (200, owner.vector)
                self.send(code, payload)

            def send(self, code, payload):
                body = json.dumps(payload).encode()
                self.send_response(code)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def client(self):
        client_type = getattr(backfill, "BackfillClient", None)
        self.assertIsNotNone(client_type, "백필이 상주 서버를 호출해야 합니다")
        return client_type(self.url, "test-token", 256)

    def test_sends_one_image_and_token_to_backfill_endpoint(self):
        client = self.client()
        client.check_health()
        self.assertEqual(client.embed(b"first-photo"), [1.0] + [0.0] * 1151)
        client.embed(b"second-photo")
        self.assertEqual(self.requests, [
            ("/health", "test-token", None),
            ("/embed-backfill", "test-token", {"images": [base64.b64encode(b"first-photo").decode()]}),
            ("/embed-backfill", "test-token", {"images": [base64.b64encode(b"second-photo").decode()]}),
        ])

    def test_rejects_wrong_model_budget_dimension_or_unready_server(self):
        client = self.client()
        for key, value in [("model", "different-model"), ("patch_budget", 128), ("dim", 768),
                           ("ok", False), ("inference_queue", None)]:
            with self.subTest(key=key), patch.dict(self.health, {key: value}), self.assertRaises(RuntimeError):
                client.check_health()

    def test_rejects_malformed_vectors_before_they_can_be_written(self):
        client = self.client()
        invalid = [None, [], {"dim": 1152}]
        for change in [{"count": 0}, {"dim": 768}, {"model": "wrong"}, {"patch_budget": 128},
                       {"vectors": []}, {"vectors": [[1.0] * 768]}, {"vectors": [[0.0] * 1152]},
                       {"vectors": [[float("nan")] * 1152]}, {"vectors": [["x"] * 1152]},
                       {"vectors": [[True] + [0.0] * 1151]}]:
            invalid.append({**self.vector, **change})
        for payload in invalid:
            with self.subTest(payload_type=type(payload).__name__):
                self.responses = [(200, payload)]
                with self.assertRaises(RuntimeError):
                    client.embed(b"photo")

    def test_retries_busy_server_but_stops_after_repeated_busy_responses(self):
        client = self.client()
        with patch("backfill_client.time.sleep"):
            self.responses = [(503, {"error": "busy"}), (200, self.vector)]
            self.assertEqual(client.embed(b"photo")[0], 1.0)
            self.assertEqual(len(self.requests), 2)
            self.responses = [(503, {"error": "busy"})] * 6
            with self.assertRaises(RuntimeError):
                client.embed(b"photo")
            self.assertEqual(len(self.requests), 8)

    def test_does_not_retry_auth_failure(self):
        client = self.client()
        self.responses = [(401, {"error": "unauthorized"})]
        with self.assertRaises(RuntimeError):
            client.embed(b"photo")
        self.assertEqual(len(self.requests), 1)

    def test_text_prompts_use_backfill_priority_in_bounded_batches(self):
        texts = [f"purpose prompt {i}" for i in range(10)]
        self.responses = [
            (200, {**self.vector, "count": 8, "vectors": self.vector["vectors"] * 8}),
            (200, {**self.vector, "count": 2, "vectors": self.vector["vectors"] * 2}),
        ]
        vectors = self.client().embed_texts(texts)
        self.assertEqual(len(vectors), 10)
        self.assertEqual(self.requests, [
            ("/embed-text-backfill", "test-token", {"texts": texts[:8]}),
            ("/embed-text-backfill", "test-token", {"texts": texts[8:]}),
        ])

    def test_text_vectors_reject_wrong_count_and_invalid_norm(self):
        for payload in [{**self.vector, "count": 2}, {**self.vector, "vectors": [[0.0] * 1152]}]:
            self.responses = [(200, payload)]
            with self.assertRaises(RuntimeError):
                self.client().embed_texts(["purpose prompt"])

    def run_main(self, apply=False, corrupt_first=False):
        from PIL import Image

        self.client()  # 미구현 상태에서 외부 DB/모델에 접근하지 않는다.
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        photos = [{"id": "photo-1", "thumb_url": "unused"}, {"id": "photo-2", "thumb_url": "unused"}]
        for photo in photos:
            Image.new("RGB", (8, 8), "red").save(os.path.join(temp.name, photo["id"] + ".jpg"))
        if corrupt_first:
            path = os.path.join(temp.name, "photo-1.jpg")
            with open(path, "rb") as f:
                raw = f.read()
            with open(path, "wb") as f:
                f.write(raw[:-2])
        writes = []

        def api(env, method, path, body=None, headers=None):
            if method == "GET":
                return photos
            self.assertEqual(method, "PATCH")
            writes.append((path, body))

        args = ["embed_photos.py", "--embed-url", self.url] + (["--apply"] if apply else [])
        with patch.object(sys, "argv", args), \
             patch.object(backfill, "load_env", return_value={"PERSONA_SERVICE_TOKEN": "test-token"}), \
             patch.dict(os.environ, {"PERSONA_SERVICE_TOKEN": "test-token"}), \
             patch.object(backfill, "CACHE_DIR", temp.name), \
             patch.object(backfill, "SAMPLE_DIR", temp.name), \
             patch.object(backfill, "api", side_effect=api), \
             patch.object(backfill, "count", side_effect=[2, 0]), \
             patch.object(backfill.siglip, "load", side_effect=AssertionError("별도 모델을 로드하면 안 됩니다")), \
             contextlib.redirect_stdout(io.StringIO()):
            try:
                backfill.main()
                error = None
            except RuntimeError as exc:
                error = exc
        return writes, error

    def test_dry_run_computes_without_writing_or_loading_another_model(self):
        writes, error = self.run_main()
        self.assertIsNone(error)
        self.assertEqual(writes, [])
        self.assertEqual([r[0] for r in self.requests], ["/health", "/embed-backfill", "/embed-backfill"])

    def test_apply_preserves_photo_mapping_and_existing_db_write_scope(self):
        second = copy.deepcopy(self.vector)
        second["vectors"][0][:2] = [0.0, 1.0]
        self.responses = [(200, self.vector), (200, second)]
        writes, error = self.run_main(apply=True)
        self.assertIsNone(error)
        self.assertEqual([w[0] for w in writes], ["photos?id=eq.photo-1", "photos?id=eq.photo-2"])
        self.assertTrue(writes[0][1]["embedding"].startswith("[1,0,"))
        self.assertTrue(writes[1][1]["embedding"].startswith("[0,1,"))
        for _, body in writes:
            self.assertEqual(set(body), {"embedding", "embedding_model", "embedded_at"})
            self.assertEqual(body["embedding_model"], "siglip2-so400m-patch16-naflex@256")

    def test_service_failure_keeps_completed_rows_and_never_marks_failed_photo(self):
        self.responses = [(200, self.vector), (500, {"error": "failed"})]
        writes, error = self.run_main(apply=True)
        self.assertIsInstance(error, RuntimeError)
        self.assertEqual([w[0] for w in writes], ["photos?id=eq.photo-1"])

    def test_truncated_jpeg_is_skipped_and_later_photo_is_still_written(self):
        writes, error = self.run_main(apply=True, corrupt_first=True)
        self.assertIsNone(error)
        self.assertEqual([w[0] for w in writes], ["photos?id=eq.photo-2"])
        self.assertEqual([r[0] for r in self.requests], ["/health", "/embed-backfill"])

    def test_all_visibility_mode_fetches_every_photo_missing_an_embedding(self):
        paths = []

        def api(env, method, path, body=None, headers=None):
            paths.append(path)
            return []

        with patch.object(backfill, "api", side_effect=api):
            backfill.fetch_pending({}, None, all_visibility=True)
        self.assertEqual(len(paths), 1)
        self.assertIn("embedding=is.null", paths[0])
        self.assertNotIn("visibility=eq.published", paths[0])

    def test_default_pending_query_remains_public_only(self):
        paths = []

        def api(env, method, path, body=None, headers=None):
            paths.append(path)
            return []

        with patch.object(backfill, "api", side_effect=api):
            backfill.fetch_pending({}, None, all_visibility=False)
        self.assertIn("visibility=eq.published", paths[0])
        self.assertIn("embedded_at=is.null", paths[0])


if __name__ == "__main__":
    unittest.main()

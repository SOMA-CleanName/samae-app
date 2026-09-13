import base64
import concurrent.futures
import http.client
import importlib
import io
import json
import sys
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

with patch.object(sys, "argv", [sys.argv[0]]):
    serve = importlib.import_module("scripts.embed.serve")


def wait_for(test, predicate):
    deadline = time.monotonic() + 2
    while not predicate() and time.monotonic() < deadline:
        time.sleep(0.002)
    test.assertTrue(predicate(), "작업이 대기열에 진입하지 않았습니다")


class PriorityQueueTest(unittest.TestCase):
    def setUp(self):
        queue_type = getattr(serve, "InferenceQueue", None)
        self.assertIsNotNone(queue_type, "검색 우선 추론 대기열이 필요합니다")
        self.queue = queue_type()

    def test_waiting_searches_overtake_backfill_and_keep_fifo(self):
        order = []

        def run(kind, label):
            with self.queue.slot(kind, timeout=2):
                order.append(label)

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            with self.queue.slot("backfill", timeout=2):
                order.append("running")
                jobs = []
                for kind, label, count in [
                    ("backfill", "backfill", 1),
                    ("interactive", "interactive", 1),
                    ("search", "search-1", 1),
                    ("search", "search-2", 2),
                ]:
                    jobs.append(pool.submit(run, kind, label))
                    wait_for(self, lambda: self.queue.snapshot()["waiting"][kind] == count)
                self.assertEqual(order, ["running"])
            for job in jobs:
                job.result(timeout=2)
        self.assertEqual(order, ["running", "search-1", "search-2", "interactive", "backfill"])

    def test_expired_search_is_removed_and_does_not_block_backfill(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            with self.queue.slot("backfill", timeout=1):
                def expire():
                    with self.queue.slot("search", timeout=0.02):
                        self.fail("만료된 검색은 실행하면 안 됩니다")
                job = pool.submit(expire)
                with self.assertRaises(TimeoutError):
                    job.result(timeout=1)
            with self.queue.slot("backfill", timeout=0.1):
                self.assertEqual(self.queue.snapshot()["waiting"]["search"], 0)

    def test_inference_error_releases_the_next_request(self):
        with self.assertRaisesRegex(RuntimeError, "inference failed"):
            with self.queue.slot("search", timeout=0.1):
                raise RuntimeError("inference failed")
        with self.queue.slot("backfill", timeout=0.1):
            self.assertEqual(self.queue.snapshot()["running"], "backfill")
        self.assertIsNone(self.queue.snapshot()["running"])


class BackfillEndpointTest(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), serve.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        token_patch = patch.object(serve, "SERVICE_TOKEN", "test-token")
        token_patch.start()
        self.addCleanup(token_patch.stop)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, body, token="test-token", path="/embed-backfill"):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            connection.request("POST", path, json.dumps(body), {
                "Content-Type": "application/json", "x-samae-token": token,
            })
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_requires_service_token(self):
        self.assertEqual(self.request({"images": ["image"]}, token="wrong")[0], 401)

    def test_rejects_multiple_images_or_bad_payload_without_skipping_rows(self):
        for payload in [[], {"images": []}, {"images": ["x", "y"]}, {"images": [123]}, {"images": ["broken"]}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.request(payload)[0], 400)

    def test_search_runs_between_backfill_images_after_gpu_result_is_copied(self):
        from PIL import Image

        self.assertTrue(hasattr(serve, "_inference"), "공유 우선순위 큐가 필요합니다")
        with io.BytesIO() as buffer:
            Image.new("RGB", (8, 8), "red").save(buffer, format="PNG")
            encoded = base64.b64encode(buffer.getvalue()).decode()
        first_started, release_first = threading.Event(), threading.Event()
        order = []

        class Tensor:
            def __init__(self, label):
                self.label = label

            def cpu(self):
                if self.label == "backfill-1":
                    first_started.set()
                    if not release_first.wait(2):
                        raise TimeoutError("test did not release inference")
                return self

            def tolist(self):
                order.append(self.label)
                return [[1.0] + [0.0] * 1151]

        serial = iter(["backfill-1", "backfill-2"])
        with patch.object(serve.siglip, "encode", side_effect=lambda *args: Tensor(next(serial))), \
             patch.object(serve.siglip, "encode_text", side_effect=lambda *args: Tensor("search")), \
             concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            first = pool.submit(self.request, {"images": [encoded]})
            self.assertTrue(first_started.wait(2))
            second = pool.submit(self.request, {"images": [encoded]})
            search = pool.submit(self.request, {"texts": ["숲속 커플"]}, path="/embed-text")
            try:
                wait_for(self, lambda: serve._inference.snapshot()["waiting"]["backfill"] == 1)
                wait_for(self, lambda: serve._inference.snapshot()["waiting"]["search"] == 1)
                self.assertEqual(order, [])
            finally:
                release_first.set()
            for job in [first, second, search]:
                status, payload = job.result(timeout=3)
                self.assertEqual(status, 200)
                self.assertEqual(payload["count"], 1)
                self.assertEqual(payload["dim"], 1152)
                self.assertEqual(payload["model"], "google/siglip2-so400m-patch16-naflex")
            self.assertEqual(first.result()[1]["patch_budget"], 256)
        self.assertEqual(order, ["backfill-1", "search", "backfill-2"])

    def test_queue_timeout_is_retryable(self):
        with patch.object(serve, "embed_texts", side_effect=TimeoutError("busy")):
            self.assertEqual(self.request({"texts": ["검색"]}, path="/embed-text")[0], 503)


if __name__ == "__main__":
    unittest.main()

import importlib
import http.client
import json
import sys
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer


original_argv = sys.argv
sys.argv = [sys.argv[0]]
try:
    serve = importlib.import_module("scripts.embed.serve")
finally:
    sys.argv = original_argv


class FakeTensor:
    def __init__(self, rows):
        self.rows = rows

    def cpu(self):
        return self

    def tolist(self):
        return self.rows


class TextEmbeddingValidationTest(unittest.TestCase):
    def test_rejects_empty_too_many_and_overlong_search_terms(self):
        invalid_values = [
            [],
            ["검색"] * 9,
            ["x" * 121],
            ["   "],
            [123],
        ]

        for value in invalid_values:
            with self.subTest(value=value), self.assertRaises(ValueError):
                serve.validate_texts(value)

    def test_trims_valid_search_terms_without_changing_their_order(self):
        self.assertEqual(
            serve.validate_texts(["  푸른 숲속 커플  ", "비 오는 날"]),
            ["푸른 숲속 커플", "비 오는 날"],
        )


class TextEmbeddingInferenceTest(unittest.TestCase):
    def test_returns_cpu_vectors_from_the_shared_siglip2_text_encoder(self):
        rows = [[0.25] * 1152, [-0.5] * 1152]
        serve._state.update(processor="processor", model="model", device="mps")

        with patch.object(serve.siglip, "encode_text", return_value=FakeTensor(rows)) as encode:
            vectors, infer_ms = serve.embed_texts(["검색어 하나", "검색어 둘"])

        self.assertEqual(vectors, rows)
        self.assertGreaterEqual(infer_ms, 0)
        encode.assert_called_once_with(
            "processor", "model", ["검색어 하나", "검색어 둘"], "mps"
        )


class TextEmbeddingEndpointTest(unittest.TestCase):
    def test_embed_text_returns_siglip2_vectors_and_model_metadata(self):
        rows = [[0.123456789] * 1152]
        server = ThreadingHTTPServer(("127.0.0.1", 0), serve.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        try:
            with patch.object(serve, "embed_texts", return_value=(rows, 7.5)) as embed:
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port)
                connection.request(
                    "POST",
                    "/embed-text",
                    body=json.dumps({"texts": ["  푸른 숲속 커플  "]}),
                    headers={"content-type": "application/json"},
                )
                response = connection.getresponse()
                payload = json.loads(response.read())
                connection.close()

            self.assertEqual(response.status, 200)
            self.assertEqual(payload["count"], 1)
            self.assertEqual(payload["dim"], 1152)
            self.assertEqual(payload["model"], serve.siglip.MODEL_ID)
            self.assertEqual(payload["vectors"][0][0], 0.123457)
            embed.assert_called_once_with(["푸른 숲속 커플"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()

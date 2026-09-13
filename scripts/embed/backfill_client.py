"""백필 전용 HTTP 클라이언트. 상주 모델에 사진 한 장씩 낮은 우선순위로 보낸다."""

import base64
import json
import math
import time
import urllib.error
import urllib.request

import siglip


class BackfillClient:
    def __init__(self, url, token, budget):
        self.url = url.rstrip("/")
        self.token = token
        self.budget = budget

    def _request(self, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["x-samae-token"] = self.token
        request = urllib.request.Request(self.url + path, data=data, headers=headers)
        for attempt in range(6):
            try:
                # 서버의 60초 백필 대기 제한보다 길게 둔다.
                with urllib.request.urlopen(request, timeout=90) as response:
                    return json.load(response)
            except urllib.error.HTTPError as e:
                code = e.code
                e.close()
                if code == 503 and attempt < 5:
                    time.sleep(1)
                    continue
                raise RuntimeError(f"백필 서버 {path}: HTTP {code}") from e
            except (urllib.error.URLError, OSError, ValueError) as e:
                raise RuntimeError(f"백필 서버 {path} 연결 또는 응답 오류") from e

    def _validate_metadata(self, payload):
        if (not isinstance(payload, dict)
                or payload.get("model") != siglip.MODEL_ID
                or payload.get("dim") != siglip.EMBED_DIM
                or payload.get("patch_budget") != self.budget):
            raise RuntimeError("백필 서버의 모델·차원·patch budget이 DB 저장 설정과 다릅니다")

    def check_health(self):
        payload = self._request("/health")
        self._validate_metadata(payload)
        if payload.get("ok") is not True or not isinstance(payload.get("inference_queue"), dict):
            raise RuntimeError("검색 우선순위를 지원하는 상주 서버가 준비되지 않았습니다")

    def embed(self, image_bytes):
        payload = self._request("/embed-backfill", {
            "images": [base64.b64encode(image_bytes).decode("ascii")],
        })
        self._validate_metadata(payload)
        vectors = payload.get("vectors")
        if (payload.get("count") != 1 or not isinstance(vectors, list) or len(vectors) != 1
                or not isinstance(vectors[0], list) or len(vectors[0]) != siglip.EMBED_DIM):
            raise RuntimeError("백필 서버가 사진 한 장의 1152차원 벡터를 반환하지 않았습니다")
        vector = vectors[0]
        if any(type(x) not in (int, float) or not math.isfinite(x) for x in vector):
            raise RuntimeError("백필 벡터에 잘못된 숫자가 있습니다")
        norm = math.sqrt(sum(x * x for x in vector))
        if not math.isclose(norm, 1.0, abs_tol=0.001):
            raise RuntimeError("백필 벡터가 L2 정규화되어 있지 않습니다")
        return vector

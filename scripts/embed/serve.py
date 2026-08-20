"""로컬 임베딩 서비스 — 맥미니에서 상주하며 SigLIP2 벡터를 뱉는다.

왜 상주 서비스인가:
  모델 로드가 비싸다(캐시가 있어도 수 초). 요청마다 로드하면 그게 곧 응답시간이 된다.
  한 번 올려두고 재사용하면 사진 9장 임베딩이 ~1.1초에 끝난다(2026-08-20 실측, MPS).

왜 임베딩인가 (VLM 대신):
  같은 사진 6장을 qwen3-vl:30b 에 보이면 이미지 입력 처리에만 20~26초가 든다.
  SigLIP 은 9장에 1.1초. 게다가 벡터가 나오므로 pgvector kNN 으로
  '내 사진과 닮은 사매 사진'을 바로 찾을 수 있다 — VLM 으로는 불가능한 일이다.

실행:
  scripts/embed/.venv/bin/python scripts/embed/serve.py [포트]

엔드포인트:
  GET  /health          → {ok, device, model, loaded_sec}
  POST /embed           → {"images": ["<base64 jpeg>", ...]}
                          {vectors: [[1152]...], mean: [1152], count, infer_ms}
  GET  /iglookup?u=아이디 → 인스타 프로필 사전조회 프록시 (아래 참고)
  POST /persona_copy    → 구조화된 팩트 → 로컬 LLM(ollama qwen3:4b) 이 결과 문장 작성
                          (판단은 이미 SigLIP 중심벡터가 끝냈다 — 여기선 작문만)

/iglookup 이 여기 있는 이유:
  Vercel(데이터센터 IP)에서는 인스타 비로그인 조회가 막힌다. 맥미니(주거용 IP)는 통과하므로
  프로덕션의 계정 확인 카드가 이 프록시를 경유한다. lookup.ts 는 직접 조회가 실패할 때만
  여기로 폴백한다.

인증:
  PERSONA_SERVICE_TOKEN 환경변수가 설정돼 있으면 모든 요청에 x-samae-token 헤더를 요구한다.
  Funnel 등으로 공개 인터넷에 노출할 때는 반드시 설정할 것.
"""

import base64
import io
import json
import os
import queue
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import siglip  # noqa: E402

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8077
SERVICE_TOKEN = os.environ.get("PERSONA_SERVICE_TOKEN", "")
PATCH_BUDGET = int(os.environ.get("SIGLIP_PATCH_BUDGET", "256"))
MAX_IMAGES = 16  # 한 요청에서 받아줄 최대 장수 — 그 이상은 사용자가 아니라 남용이다

_state = {"processor": None, "model": None, "device": None, "loaded_sec": 0.0}

# ── 마이크로 배칭 ─────────────────────────────────────────────
# MPS 는 동시에 여러 그래프를 돌리면 안 되므로 어차피 직렬이다. 그렇다면
# 대기 중인 요청들을 **한 번의 encode 로 묶는 게** 이득이다 — 커널 런치·전처리
# 오버헤드가 요청 수가 아니라 배치 수에 비례하게 된다.
# 실측(2026-08-20, 배칭 전): 8요청×9장 동시에 최장 14.2s — 앱 타임아웃(12s)을 넘어
# 부하 시 추천이 조용히 사라지는 상태였다.
_jobs: "queue.Queue[dict]" = queue.Queue()
MAX_BATCH_IMAGES = 32  # 한 번의 encode 에 넣을 최대 장수 (메모리·지연 균형)


def _worker():
    from PIL import Image  # noqa: F401  (지연 로드 일관성)

    while True:
        first = _jobs.get()  # 블로킹 — 일 없으면 잔다
        batch = [first]
        n_images = len(first["images"])
        # 큐에 이미 쌓인 것을 즉시 흡수 (추가 대기 없음 — 지연을 만들지 않는 배칭)
        while n_images < MAX_BATCH_IMAGES:
            try:
                nxt = _jobs.get_nowait()
            except queue.Empty:
                break
            batch.append(nxt)
            n_images += len(nxt["images"])

        try:
            t = time.perf_counter()
            all_images = [img for job in batch for img in job["images"]]
            emb = siglip.encode(
                _state["processor"], _state["model"], all_images, PATCH_BUDGET, _state["device"]
            )
            ms = (time.perf_counter() - t) * 1000
            # ⚠️ 반드시 여기서 CPU 리스트로 변환한다.
            # MPS 텐서를 파이썬에서 원소 단위로 순회하면(응답 직렬화 등)
            # 원소마다 디바이스 동기화가 걸린다 — 실측에서 추론 2.2s 인데
            # 응답에 11s 가 새던 원인이 바로 이것이었다. tolist() 는 한 번에 옮긴다.
            rows = emb.cpu().tolist()
            off = 0
            for job in batch:
                k = len(job["images"])
                job["result"] = rows[off : off + k]
                job["infer_ms"] = ms
                job["batched_with"] = len(batch) - 1
                off += k
                job["done"].set()
        except Exception as e:  # 배치 전체 실패 — 각 요청에 에러 전달
            for job in batch:
                job["error"] = str(e)
                job["done"].set()


def warm():
    from PIL import Image

    t = time.perf_counter()
    processor, model, device = siglip.load()
    _state.update(processor=processor, model=model, device=device)
    # 첫 추론은 커널 컴파일로 느리다 — 서비스가 뜨는 동안 미리 태워 둔다.
    siglip.encode(processor, model, [Image.new("RGB", (256, 256), (128, 128, 128))], PATCH_BUDGET, device)
    _state["loaded_sec"] = time.perf_counter() - t
    print(f"✅ 모델 준비 {_state['loaded_sec']:.1f}s (device={device}, budget={PATCH_BUDGET})", flush=True)


def embed(images_b64):
    from PIL import Image

    images = []
    for b64 in images_b64[:MAX_IMAGES]:
        try:
            images.append(Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB"))
        except Exception:
            continue  # 깨진 한 장 때문에 전체를 버리지 않는다
    if not images:
        return None, 0

    job = {"images": images, "done": threading.Event()}
    _jobs.put(job)
    if not job["done"].wait(timeout=60):
        raise RuntimeError("embed 워커 응답 없음 (60s)")
    if "error" in job:
        raise RuntimeError(job["error"])
    return job["result"], job["infer_ms"]


import re as _re
import urllib.request as _rq

_IG_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
          "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def ig_lookup(username: str):
    """인스타 비로그인 프로필 조회 — lookup.ts 와 동일한 헤더 세트(Sec-Fetch 필수)."""
    if not _re.fullmatch(r"[a-z0-9._]{1,30}", username):
        return {"status": "not_found"}
    url = f"https://www.instagram.com/api/v1/users/web_profile_info/?username={username}"
    req = _rq.Request(url, headers={
        "User-Agent": _IG_UA,
        "x-ig-app-id": "936619743392459",
        "Accept": "*/*",
        "Referer": "https://www.instagram.com/",
        # undici 와 같은 이유 — 이 3종이 없으면 SecFetch Policy violation(400)
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
    })
    try:
        with _rq.urlopen(req, timeout=6) as r:
            u = (json.load(r).get("data") or {}).get("user")
    except _rq.HTTPError as e:
        return {"status": "not_found"} if e.code == 404 else {"status": "unavailable"}
    except Exception:
        return {"status": "unavailable"}
    if not u or not u.get("username"):
        return {"status": "not_found"}

    avatar = None
    pic = u.get("profile_pic_url")
    if pic:
        try:
            with _rq.urlopen(_rq.Request(pic, headers={"User-Agent": _IG_UA}), timeout=5) as r:
                raw = r.read()
                ctype = (r.headers.get("Content-Type") or "image/jpeg").split(";")[0]
            if 0 < len(raw) <= 400_000:
                avatar = f"data:{ctype};base64,{base64.b64encode(raw).decode()}"
        except Exception:
            pass
    return {
        "status": "found",
        "profile": {
            "username": u["username"],
            "fullName": u.get("full_name") or "",
            "isPrivate": bool(u.get("is_private")),
            "isVerified": bool(u.get("is_verified")),
            "followers": (u.get("edge_followed_by") or {}).get("count", 0),
            "posts": (u.get("edge_owner_to_timeline_media") or {}).get("count", 0),
            "avatar": avatar,
        },
    }


OLLAMA = os.environ.get("OLLAMA_HOST_URL", "http://127.0.0.1:11434")
COPY_MODEL = os.environ.get("PERSONA_COPY_MODEL", "qwen3:4b-instruct")

# 작문 출력 스키마 — 판단 필드(moodIds·photoIndexes)는 없다. 그건 SigLIP 몫.
COPY_SCHEMA = {
    "type": "object",
    "properties": {
        "shootPersonaLabel": {"type": "string"},
        "oneLiner": {"type": "string"},
        "psychHook": {"type": "string"},
        "bigFive": {
            "type": "object",
            "properties": {k: {"type": "integer", "minimum": 0, "maximum": 100}
                           for k in ["openness", "conscientiousness", "extraversion",
                                     "agreeableness", "emotionalStability"]},
            "required": ["openness", "conscientiousness", "extraversion",
                         "agreeableness", "emotionalStability"],
        },
        "attachmentLabel": {"type": "string"},
        "attachmentReason": {"type": "string"},
        "moodReasons": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"moodTitle": {"type": "string"},
                               "signal": {"type": "string"},
                               "why": {"type": "string"}},
                "required": ["moodTitle", "signal", "why"],
            },
        },
        "evidence": {"type": "array", "items": {"type": "string"}},
        "locations": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["shootPersonaLabel", "oneLiner", "psychHook", "bigFive",
                 "attachmentLabel", "attachmentReason", "moodReasons", "evidence", "locations"],
}

COPY_SYSTEM = """당신은 촬영 서비스의 카피라이터입니다. 아래에 주어지는 '팩트'만 근거로 결과 문장을 씁니다.
팩트에 없는 내용을 지어내지 마세요. 무드·근거사진 번호는 이미 확정돼 있습니다 — 당신은 그것을 자연스러운 한국어로 풀어쓸 뿐입니다.

⚠️ 당신은 사진을 보지 못했습니다. 사진 속 장소·사물·인물·장면을 묘사하지 마세요
("카페", "한강", "창가" 같은 구체 명사 금지). 근거(signal)는 사진 번호 + 무드와의
유사도 강도 + '실측_톤' 팩트로만 말하세요.
(좋은 예: "사진 2·5·7이 이 무드와 가장 가깝게 읽히고, 따뜻한 계열의 중간 밝기 톤이 그 결을 받쳐줘요")

말투(모든 필드 공통): 해요체 존댓말로 끝맺습니다("~해요", "~돼요", "~어울려요").
명사형 종결("~함", "~임", "~됨") 금지. 상대는 '당신'. '너·네' 금지.

- shootPersonaLabel: 이 사람만의 촬영 페르소나 별칭, 8~20자. 「수식어구 + 명사」 꼴로,
  사람을 부르는 별명처럼 들려야 해요. 무드 이름을 그대로 쓰거나 어미만 바꿔 쓰는 건 금지
  (선택된 무드에 들어있는 단어를 라벨에 재사용하지 마세요) — 무드의 분위기와 실측_톤을
  빛·온도·질감·시간대 같은 감각 언어로 번역해 새로 지으세요. 어디서 본 문구 재사용 금지.
- oneLiner: 어떤 사람인지 한 줄 (활동 나열 말고 성격·태도, "~사람"으로 끝나도 좋아요)
- psychHook: 2문장 이내. 팩트에서 읽히는 태도·취향을 따뜻하게 짚어주는 문장.
  읽는 사람이 자기 얘기라고 느껴야 해요 — 이 지시문의 표현을 그대로 옮기지 마세요.
- attachmentLabel: 관계에서의 안정적인 애착 결을 표현하는 6~12자 별칭.
  shootPersonaLabel 과 단어가 겹치면 안 돼요. attachmentReason 은 그 이유 1문장.
- moodReasons: 주어진 무드 각각에 대해 signal(팩트의 근거사진 번호·유사도를 자연어로) +
  why(그래서 어울리는 이유) 각 1문장, 해요체
- evidence: 판단 근거 3개, 각 1문장 해요체
- locations: 어울리는 촬영 장소 2~3곳 (명사구, 실제 있을 법한 장소 유형 — 상호명·지어낸 합성어 금지)
- bigFive 점수는 주어진 지표를 참고하고, 신호가 약하면 45~60 중앙값
- 반드시 JSON 스키마로만 출력"""


def persona_copy(facts: dict):
    """팩트 → ollama 작문. 실패 시 None (호출부 폴백)."""
    body = json.dumps({
        "model": COPY_MODEL,
        "stream": False,
        "format": COPY_SCHEMA,
        "options": {"temperature": 0.8, "num_ctx": 4096, "num_predict": 900},
        "messages": [
            {"role": "system", "content": COPY_SYSTEM},
            {"role": "user", "content": json.dumps(facts, ensure_ascii=False)},
        ],
    }).encode()
    req = _rq.Request(f"{OLLAMA}/api/chat", data=body,
                      headers={"Content-Type": "application/json"})
    with _rq.urlopen(req, timeout=60) as r:
        out = json.load(r)
    return json.loads(out["message"]["content"])


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _auth_ok(self) -> bool:
        if not SERVICE_TOKEN:
            return True  # 토큰 미설정 = 로컬 전용 가정
        return self.headers.get("x-samae-token", "") == SERVICE_TOKEN

    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass  # 기본 액세스 로그는 시끄럽다

    def do_GET(self):
        if not self._auth_ok():
            self._send(401, {"error": "unauthorized"})
            return
        if self.path.startswith("/iglookup"):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            username = (q.get("u") or [""])[0].strip().lstrip("@").lower()
            self._send(200, ig_lookup(username))
            return
        if self.path.startswith("/health"):
            self._send(200, {
                "ok": _state["model"] is not None,
                "device": _state["device"],
                "model": siglip.MODEL_ID,
                "dim": siglip.EMBED_DIM,
                "patch_budget": PATCH_BUDGET,
                "loaded_sec": round(_state["loaded_sec"], 1),
            })
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if not self._auth_ok():
            self._send(401, {"error": "unauthorized"})
            return
        if self.path.startswith("/persona_copy"):
            try:
                n = int(self.headers.get("Content-Length", "0"))
                facts = json.loads(self.rfile.read(n) or b"{}")
                t = time.perf_counter()
                copy = persona_copy(facts)
                self._send(200, {"copy": copy, "gen_ms": round((time.perf_counter() - t) * 1000)})
            except Exception as e:
                self._send(500, {"error": f"copy 실패: {e}"})
            return
        if not self.path.startswith("/embed"):
            self._send(404, {"error": "not found"})
            return
        try:
            n = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(n) or b"{}")
        except Exception as e:
            self._send(400, {"error": f"bad json: {e}"})
            return

        images = payload.get("images") or []
        if not isinstance(images, list) or not images:
            self._send(400, {"error": "images 배열이 필요합니다"})
            return

        try:
            emb, ms = embed(images)
        except Exception as e:
            self._send(500, {"error": f"embed 실패: {e}"})
            return
        if emb is None:
            self._send(400, {"error": "디코딩 가능한 이미지가 없습니다"})
            return

        # emb 는 CPU 파이썬 리스트다 (워커에서 변환됨 — 위 주석 참고)
        n = len(emb)
        dim = len(emb[0])
        mean_raw = [sum(row[i] for row in emb) / n for i in range(dim)]
        norm = sum(v * v for v in mean_raw) ** 0.5 or 1.0
        self._send(200, {
            "count": n,
            "dim": dim,
            "infer_ms": round(ms, 1),
            "vectors": [[round(x, 6) for x in row] for row in emb],
            "mean": [round(v / norm, 6) for v in mean_raw],
        })


if __name__ == "__main__":
    warm()
    threading.Thread(target=_worker, daemon=True, name="embed-worker").start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"🚀 임베딩 서비스 http://127.0.0.1:{PORT}", flush=True)
    server.serve_forever()

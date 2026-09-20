# 28. 임베딩·목적 태그 배치 자동화 (2026-08-19)

> 문서 상태: **운영 중 (2026-08-21 맥미니 설치 완료).** 런타임은 `~/srv/samae-app`, 매일 06:00 자동 실행. 설치 경위와 TCC 함정은 §4·§7 참고.
>
> 선행 문서: [22 시각 유사도 추천](22-visual-similarity.md) §7.4 — 이 작업이 그 문서의 **6단계**다.
>
> **검색용 상주 서버 운영 가이드: [§8](#search-server).** 사진 백필과 함께 켜둘 서비스, `/embed-text` 인증, Funnel 연결, 앱 설정, 점검·재시작 순서를 정리했다 (2026-09-14 추가).
>
> **2026-09-15 목적 태그 자동화 추가: [§9](#daily-purpose).** 기존 오전 6시 작업에서 사진 임베딩 다음에 목적도 처리한다. 맥미니 런타임 갱신·상주 서버 재시작이 필요하다.

---

## 1. 왜 지금 하는가

[22 문서](22-visual-similarity.md) §7.4 는 6단계를 의도적으로 보류하면서 착수 조건을 정해 뒀다.

> **자동화 전환 조건** (둘 중 하나면 착수)
> - 업로드가 하루 100장을 넘음
> - 작가가 "새 사진이 추천에 안 뜬다" 고 문의하기 시작함

조건은 이미 넘었다. 2026-08-07 관찰에서 하루 만에 대기가 181장 쌓였고, 2026-08-19 확인 시점에도 **44장이 밀려 있었다**(8/15 업로드분).

**보류의 대가가 눈에 보이지 않는다는 것이 문제다.** 임베딩이 없는 사진은 자기 상세에서 태그 폴백으로 떨어지는 데 그치지 않는다. `0069` RPC 의 후보 조회에 `embedding is not null` 이 있어 **다른 사진의 추천에도 등장하지 못한다.** 추천은 계속 정상으로 보이고, 없는 사진이 안 뜰 뿐이다.

---

## 2. 방식 결정 — 맥미니 + launchd

| 후보 | 판단 |
|---|---|
| **맥미니 + launchd** | **채택.** 모델이 로컬에서 완결되고 MPS 가속을 그대로 쓴다. 새 계정·결제·배포가 없다 |
| Modal / HF Inference Endpoint + Vercel 크론 | 22 문서가 제안한 형태. 실시간에 가깝지만 외부 서비스와 월 비용이 새로 생긴다 |
| GitHub Actions 스케줄 | 비용은 0 이지만 러너가 CPU 라 느리고, 모델 4.4GB 를 캐시로 관리해야 한다 |

**Vercel 서버리스에 torch 를 올릴 수 없다**는 제약은 그대로다. 다만 지금 업로드 페이스(하루 수십 장)에서는 실시간이 필요 없고, **하루 한 번이면 충분하다.** 사진을 올리고 몇 시간 뒤 추천에 뜨는 것은 문제가 되지 않는다.

맥미니가 이미 있으므로 추가 비용이 0 이고, 배치 스크립트(`embed_photos.py`)는 이미 검증돼 있어 그대로 재사용한다.

---

## 3. 구성

```
launchd (매일 06:00)
   └─ run-embed.sh
        ├─ embed_photos.py --apply --embed-url http://127.0.0.1:8077
        │    └─ 상주 serve.py /embed-backfill로 한 장씩 추론 (검색 우선)
        ├─ purpose_backfill.py --apply --daily --embed-url http://127.0.0.1:8077
        │    ├─ 검수한 포트폴리오의 신규 사진에 기존 목적 상속
        │    └─ /embed-text-backfill + 저장된 사진 벡터로 미처리 목적 분류
        ├─ 로그 기록 (최근 14개 유지)
        └─ 실패 시 디스코드 알림
```

| 파일 | 역할 |
|---|---|
| `scripts/embed/macmini-setup.sh` | Python·venv·패키지·모델 캐시·launchd 등록. **재실행 안전** |
| `scripts/embed/run-embed.sh` | 사진 임베딩 → 목적 분류 실행 래퍼. 로그·락·실패 알림 |
| `scripts/embed/purpose_backfill.py` | 신규·미처리 목적 분류 및 기존 검수 목적 상속 |
| `scripts/embed/com.samae.embed.plist.template` | launchd 정의. `__REPO__` 를 설치 시 실제 경로로 치환 |

plist 를 템플릿으로 둔 이유는 **저장소 경로가 기계마다 다르기 때문이다.** 경로를 박아 커밋하면 그 기계에서만 동작한다. 설치 스크립트가 자기 위치에서 저장소 루트를 계산해 렌더한다.

실행 시각은 **06:00** 이다. 사용자 트래픽이 가장 적고, 오전 업무 시작 전에 전날 업로드분이 반영된다.

---

## 4. 설치 (맥미니에서 한 번)

> ⚠️ **TCC 함정 (2026-08-21 실측)**: launchd 는 `~/Documents`·`~/Desktop`·`~/Downloads` 안의
> 파일을 읽지 못한다 (macOS 폴더 보호 — 에이전트가 "Operation not permitted" 로 조용히 죽는다).
> **런타임 clone 은 반드시 보호 폴더 밖**(예: `~/srv/samae-app`)에 둘 것. 개발 저장소가
> Documents 에 있어도 런타임은 별도 clone 으로 분리한다. 스크립트가 바뀌면 런타임 쪽에서
> `git pull --ff-only` 로 동기화한다. **상주 서비스는 갱신 후 재시작해야 새 코드를 읽는다**(§8.6).
> setup 스크립트가 보호 경로에서 실행되면 거부한다.

```bash
git clone https://github.com/SOMA-CleanName/samae-app.git ~/srv/samae-app
cd ~/srv/samae-app

# .env.local 을 옮겨 넣는다 (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요.
#  검색·페르소나 상주 서비스에는 PERSONA_SERVICE_TOKEN 도 필요.
#  PERSONA_EMBED_URL 은 이 서비스를 호출하는 앱 쪽에 설정한다 — §8 참고.)

bash scripts/embed/macmini-setup.sh
sudo pmset -a sleep 0 disksleep 0      # 안내에 따라 직접 실행
```

setup ④단계가 비어 있지 않은 `PERSONA_SERVICE_TOKEN`을 확인하고, ⑦단계가 **검색·페르소나 상주 서비스**
(`com.samae.serve` — serve.py: SigLIP 이미지·텍스트 임베딩·인스타 조회 프록시·qwen3 작문)도 함께 등록한다.
로그인 시 자동시작 + 죽으면 10초 간격 재시작(KeepAlive). 프로덕션(samae.ai)이 Tailscale
Funnel 로 이 서비스를 부르므로, 죽어 있으면 페르소나가 claude 폴백(과금)으로 돈다.
ollama 는 `brew services start ollama` 로 자동시작을 건다 (docs/23 §7).

**검색 우선 처리 버전에서는 자동 백필에도 상주 서비스가 필수다.** 토큰이 없거나 비어 있으면 새 setup은 작업 등록 전에 중단한다. 예전 setup에서 ⑦단계를 건너뛴 환경은 토큰을 설정하고 setup을 다시 실행한 뒤 §8.3의 서버 점검을 먼저 통과시킨다. 백필 자체는 Funnel을 거치지 않고 맥미니 내부 8077을 호출한다.

설치 스크립트가 하는 일은 순서대로 Python 3.12 확인 → venv → 패키지 → `.env.local` 검사 → 모델 캐시 예열(4.4GB) → launchd 등록이다. **sudo 가 필요한 슬립 설정은 자동으로 하지 않고 명령만 안내한다.**

### 확인

```bash
launchctl list | grep com.samae.embed        # 등록 여부
bash scripts/embed/run-embed.sh              # 지금 한 번 실행
tail -f scripts/embed/logs/embed-*.log       # 로그
python3 scripts/embed/check_db.py            # 임베딩 대기 수치
```

### 해제

```bash
launchctl unload ~/Library/LaunchAgents/com.samae.embed.plist
```

---

## 5. 설계 판단

**성공은 알리지 않는다.** 매일 "성공했습니다" 가 오면 사람이 읽지 않게 되고, 그러면 진짜 실패도 묻힌다. 실패했을 때만 로그 꼬리 15줄과 함께 디스코드(`DISCORD_OPS_WEBHOOK_URL`)로 보낸다.

**동시 실행을 막는다.** 앞 회차가 길어졌을 때 두 프로세스가 같은 행을 갱신하지 않도록 디렉터리 락을 쓴다. 겹치면 조용히 건너뛴다.

**`.env.local` 권한을 600 으로 좁힌다.** `SUPABASE_SERVICE_ROLE_KEY` 는 RLS 를 전부 우회한다. 맥미니에 평문으로 두게 되므로 최소한 다른 계정이 읽지 못하게 한다.

**로그는 14개만 남긴다.** 무한히 쌓이면 디스크만 먹고 아무도 보지 않는다.

**커버리지 판정은 배치 스크립트에 맡긴다.** `embed_photos.py` 가 마지막에 DB 를 다시 조회해 "커버리지 N/N" 을 찍는다. 전송 수를 반영 수로 믿으면 안 되는 이유는 [26 문서](26-interest-similar-recommendations.md) 가 아니라 [22 문서](22-visual-similarity.md) §9.2 에 있다 — PostgREST 는 매칭 0행인 PATCH 에도 204 를 준다.

---

## 6. 알려두는 한계

**맥미니가 꺼지면 아무 일도 일어나지 않는다.** 배치가 안 돌고, 실패 알림도 못 간다(죽은 기계는 보고할 수 없다). 대기 장수만 조용히 쌓인다.

이것을 감시하려면 이미 매일 도는 `daily-digest` 크론이 "임베딩 대기 N장" 을 리포트하면 된다. **이번 범위에서는 하지 않기로 했다.** 필요해지면 `src/lib/ops-digest.ts` 에 한 줄을 더한다.

당장의 확인 수단은 수동이다.

```bash
python3 scripts/embed/check_db.py        # "임베딩 대기" 줄
```

---

## 7. 실행 이력

| 일시(KST) | 내용 | 결과 |
|---|---|---|
| 2026-08-19 | 맥북에서 `run-embed.sh` 동작 검증 | 밀려 있던 **44장 처리 · 41초 · 실패 0**. 커버리지 1,807/1,807 (대기 0) |
| 2026-08-21 | 맥미니 설치 (런타임 `~/srv/samae-app`) | launchd 등록 + 수동 1회 검증(대기 0장 no-op). **Documents 경로 1차 시도는 TCC 로 실패** → §4 함정 문서화 + setup 가드 추가. 상주 서비스(com.samae.serve)·ollama 자동시작 동시 등록 |

---

<a id="search-server"></a>

## 8. 검색어를 처리하는 SigLIP 2 상주 서버

### 8.1 무엇을 켜두어야 하는가

사용자가 입력한 검색어는 요청 시점에 벡터로 바꿔야 한다. **사진 백필이 완료돼 있어도 `com.samae.serve` 에 연결되지 않으면 자연어 벡터 검색은 동작하지 않는다.** 기존 페르소나용 `serve.py` 가 `/embed-text` 도 제공하므로 같은 상주 모델을 재사용한다. 검색의 상세 동작은 [29 검색어 기반 사진 검색](29-siglip-text-search.md)을 참고한다.

| 구성요소 | 실행 시점 | 하는 일 |
|---|---|---|
| `com.samae.embed` → `run-embed.sh` | 매일 06:00 | 공개 사진 임베딩을 저장한 뒤 목적 태그도 백필 (§9) |
| `com.samae.serve` → `run-serve.sh` → `serve.py` | 로그인 시 시작, 계속 상주 | `127.0.0.1:8077`에서 모델 하나로 검색·사용자 이미지·백필을 우선순위대로 추론 |
| Tailscale Funnel | 외부 앱이 맥미니를 호출하는 동안 유지 | 공개 HTTPS 주소를 맥미니의 `127.0.0.1:8077` 로 연결 |
| Next.js 앱 서버 | 사용자가 검색할 때 | 텍스트 벡터를 DB RPC 에 전달하고 사진 결과를 화면에 표시 |

```text
사진 업로드 → 매일 백필 → 로컬 /embed-backfill → photos.embedding 에 사진 벡터 저장

사용자 검색 → Next.js 서버
               └─ HTTPS Funnel → 맥미니 POST /search-query   (2026-09-18~, #372)
                                  ├─ Kiwi 로 형태소를 쪼갬
                                  ├─ 사전 대조 → 목적 · 세부분류 · 성별
                                  │    ("가을 커플스냅" → 커플 + "가을", "만삭" → 행사·만삭, "여자" → 개인·여성)
                                  ├─ 사전에 없는 명사 → KURE-v1 로 가장 가까운 사전 말의 목적 (선택, §8.2)
                                  └─ 남은 말의 SigLIP 2 텍스트 벡터 반환
                    → 목적·세부분류·성별은 **필터**, 벡터는 그 안에서 **순서**
               → 공개·승인·비숨김 사진 조회 → 검색 화면
               (404·501 이면 예전처럼 POST /embed-text 로 검색어 통째)
```

**태그(메타데이터) 검색은 2026-09-18 부터 섞지 않는다.** 결과는 SigLIP 으로만 만든다 — 자세한 규칙은 [29 §12](29-siglip-text-search.md).
그 결과 **맥미니에 닿지 못하면 검색 결과가 통째로 빈다.** 전에는 태그 결과가 그 장애를 가려서 화면이 멀쩡해 보였다.
배포 직후 운영에서 실제로 모든 검색이 "결과가 없어요" 가 됐다(원인 확인 중). 맥미니·Funnel 상태가 곧 검색 가용성이다.

모델은 사진과 같은 `google/siglip2-so400m-patch16-naflex`, 벡터는 **1152차원**이다. 실제 사진과의 거리 계산은 Supabase 의 기존 `similar_photos_by_vector` RPC 가 맡는다. 검색할 때 사진 백필을 다시 실행하거나 DB 마이그레이션을 적용할 필요는 없다.

맥미니는 전원·네트워크 연결과 §4의 슬립 방지 설정을 유지한다. 두 작업은 `~/Library/LaunchAgents` 에 등록되므로 **등록한 macOS 계정에 로그인돼 있어야 한다.** 화면 잠금은 가능하지만 로그아웃·재부팅 후 미로그인 상태를 정상 운영 상태로 보지 않는다. 검색 경로는 Ollama 를 호출하지 않는다. Ollama 는 기존 페르소나 작문을 운영할 때 별도로 유지한다.

### 8.2 맥미니 코드와 상주 서비스 준비

아래 명령은 **맥미니에서 서비스 등록에 사용한 계정으로** 실행한다. `~/srv/samae-app` 은 운영에 사용할 변경이 원격에 반영된 브랜치를 추적해야 한다. 작업 트리가 깨끗한지 확인하고 그 브랜치를 갱신한다.

```bash
cd ~/srv/samae-app
git status --short --branch
git pull --ff-only
grep -nE '/embed-text|/embed-backfill|/search-query' scripts/embed/serve.py
scripts/embed/.venv/bin/pip install -r scripts/embed/requirements.txt
```

`/embed-text`·`/embed-backfill`·`/search-query` 중 없는 것이 있으면 해당 기능이 포함된 버전이 런타임에 아직 반영되지 않은 것이다. 앱 코드만 갱신해도 맥미니의 별도 clone 은 갱신되지 않는다.
`/search-query` 는 형태소 분석기 `kiwipiepy` 가 필요하다. **`git pull` 로는 설치되지 않으므로** 위 `pip install` 을 함께 한다. 없으면 서버는 뜨지만 `/search-query` 가 501 을 주고, 로그에 `검색어 분리 꺼짐` 이 남는다. 실행 순서와 판정은 [38](38-macmini-search-handoff.md) §3-1·§5-0 을 따른다.

사전에 없는 검색어를 가장 가까운 사전 말의 목적으로 보내려면 한국어 임베딩 모델 `nlpai-lab/KURE-v1`(MIT, 약 2.2GB·메모리 1.1GB)이 더 필요하다([38](38-macmini-search-handoff.md) §3-2, [29 §12.12](29-siglip-text-search.md)). **선택이다** — 없으면 사전에 있는 말만 목적으로 잡는다. 상주 서버는 받아 둔 모델만 쓰고 켜질 때 내려받지 않는다. `SAMAE_PURPOSE_NEAREST=0` 으로 끌 수 있고, `/health` 의 `purpose_nearest` 로 켜졌는지 본다. SigLIP 과 같은 GPU 를 쓰므로 호출은 한 번에 하나씩 돈다.

맥미니의 `.env.local` 에 **기존 `PERSONA_SERVICE_TOKEN` 값을 유지**한다. 최초 구성이라면 충분히 긴 임의의 공유 토큰을 정해 맥미니와 호출 앱에 같은 값을 넣는다. 아래 예시의 대체 문구를 실제 토큰으로 바꾼다. 기존 Supabase 환경변수는 백필용으로 계속 필요하다.

```dotenv
PERSONA_SERVICE_TOKEN="REPLACE_WITH_SHARED_TOKEN"
```

`run-serve.sh` 는 `.env.local` 을 셸로 읽으므로 `KEY=VALUE` 형식을 유지한다. 토큰을 커밋하거나 로그에 출력하지 않는다. `serve.py` 자체는 토큰이 없으면 인증을 생략하지만, 운영용 `run-serve.sh` 는 빈 토큰을 거부한다.

최초 설치이거나 `com.samae.serve` 가 등록되지 않았다면 §4와 같은 setup 을 실행한다. 이미 설치된 가상환경·모델 캐시를 재사용하며 배치와 상주 서비스를 함께 등록한다.

```bash
cd ~/srv/samae-app
bash scripts/embed/macmini-setup.sh
launchctl list | grep -E 'com\.samae\.(embed|serve)'
```

기존 상주 서비스가 등록돼 있고 코드·환경변수만 바뀌었다면 §8.6의 재시작 명령을 사용한다. `com.samae.serve` 는 `RunAtLoad` 와 `KeepAlive` 로 시작·복구되며, 재시작 간 최소 간격은 10초다. 첫 모델 다운로드·로딩이 끝날 때까지 기다린 뒤 다음 점검을 진행한다.

### 8.3 맥미니 안에서 인증·텍스트 추론 확인

아래 함수를 **맥미니 프로젝트 루트의 터미널에 한 번 정의**한다. `.env.local` 에서 토큰을 읽어 헤더로 보내고, 벡터 전체와 토큰 대신 모델명·차원·시간만 출력한다. Python 표준 라이브러리만 사용한다.

```bash
cd ~/srv/samae-app
check_siglip() {
  scripts/embed/.venv/bin/python - "$1" <<'PY'
import json
import math
import sys
import time
import urllib.request

sys.path.insert(0, "scripts/embed")
from check_db import load_env

base = sys.argv[1].rstrip("/")
token = load_env(".env.local").get("PERSONA_SERVICE_TOKEN", "")
if not token or token == "REPLACE_WITH_SHARED_TOKEN":
    raise SystemExit("실제 PERSONA_SERVICE_TOKEN 값을 먼저 설정하세요.")
model = "google/siglip2-so400m-patch16-naflex"

def request(path, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        base + path, data=body,
        headers={"x-samae-token": token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.load(response)

health = request("/health")
assert health.get("ok") and health.get("model") == model, health
assert health.get("dim") == 1152, health
assert health.get("patch_budget") == 256 and isinstance(health.get("inference_queue"), dict), health
print("health:", health)
started = time.perf_counter()
result = request("/embed-text", {"texts": ["푸른 숲속 커플 사진"]})
elapsed_ms = (time.perf_counter() - started) * 1000
assert result.get("model") == model and result.get("count") == 1
vectors = result.get("vectors", [])
assert len(vectors) == 1 and len(vectors[0]) == 1152
assert all(isinstance(x, (int, float)) and math.isfinite(x) for x in vectors[0])
norm = math.sqrt(sum(x * x for x in vectors[0]))
assert abs(norm - 1) < 0.01, norm
print(json.dumps({"dim": 1152, "infer_ms": result.get("infer_ms"),
                  "request_ms": round(elapsed_ms, 1), "norm": round(norm, 6)}))
PY
}
check_siglip http://127.0.0.1:8077
```

정상 기준은 `ok: true`, 위 모델명, `dim: 1152`, 벡터 길이(norm) 약 1이다. 맥미니에서는 보통 `device: mps` 가 표시된다. `cpu` 라면 실행 자체와 별개로 가속 설정·실제 응답 시간을 확인한다. 첫 텍스트 요청 이후 한 번 더 실행해 워밍된 응답도 확인한다.

운영 토큰이 적용돼 있으면 **토큰 없는 요청은 401** 이어야 한다.

```bash
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  http://127.0.0.1:8077/health
```

### 8.4 외부 앱이 호출할 Funnel 연결

로컬 점검을 통과한 뒤 맥미니에서 기존 연결을 확인한다.

```bash
tailscale status
tailscale funnel status
```

이미 `/` 가 `http://127.0.0.1:8077` 로 연결돼 있으면 그 HTTPS 주소를 재사용한다. 다른 서비스가 같은 주소·포트를 쓰고 있다면 기존 경로를 확인한 뒤 구성한다. 새로 연결해야 할 때의 명령은 다음과 같다.

```bash
tailscale funnel --bg http://127.0.0.1:8077
tailscale funnel status
```

`--bg` 는 터미널을 닫아도 연결을 유지하고, Tailscale 재시작 후에도 설정을 다시 사용하게 한다. 최초 사용 시 CLI 에 안내되는 Funnel 허용·HTTPS 설정을 완료한다. 명령과 재시작 동작은 [Tailscale 공식 Funnel 가이드](https://tailscale.com/docs/reference/tailscale-cli/funnel)를 따른다.

출력된 **실제 HTTPS 기본 주소**를 사용한다. `/embed-text` 를 주소 끝에 붙이지 않는다. §8.3 함수를 정의한 같은 터미널에서 아래 예시 주소를 실제 주소로 바꿔 외부 경로도 확인한다.

```bash
check_siglip "https://YOUR-MACMINI.YOUR-TAILNET.ts.net"
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  "https://YOUR-MACMINI.YOUR-TAILNET.ts.net/health"
```

첫 명령은 인증된 벡터 응답, 두 번째는 `401` 이어야 한다. Funnel 은 인터넷에 공개되는 경로이므로 **로컬과 HTTPS 경로 모두 토큰 인증을 확인**한다. `serve.py` 의 바인딩은 `127.0.0.1` 로 유지한다.

### 8.5 Next.js 앱 연결과 실제 검색 확인

**호출하는 앱 쪽**에 다음 두 환경변수를 설정한다. 로컬 개발은 그 PC의 `.env.local`, Vercel 은 프로젝트 환경변수의 대상 배포 환경(Production 또는 사용할 Preview)에 넣는다.

```dotenv
PERSONA_EMBED_URL=https://YOUR-MACMINI.YOUR-TAILNET.ts.net
PERSONA_SERVICE_TOKEN="REPLACE_WITH_SHARED_TOKEN"
```

주소는 §8.4에서 확인한 값이고, 토큰은 맥미니와 동일해야 한다. 이 두 변수에 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. DB 검색에는 앱 쪽의 기존 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 도 필요하다.

개발 모드에서 `PERSONA_EMBED_URL` 을 비우면 **앱이 실행 중인 PC의 `127.0.0.1:8077`** 를 사용한다. 다른 PC에서 맥미니를 호출하려면 URL을 명시해야 한다. Production 에서는 URL 미설정 시 검색을 실패 처리하고 사진 영역에 지연 안내를 표시한다. `serve.py` 만 실행하는 맥미니에는 자기 자신을 가리키는 `PERSONA_EMBED_URL` 이 필수는 아니다.

로컬 앱은 환경변수를 바꾼 뒤 개발 서버를 재시작한다. Vercel 환경변수 변경은 새 배포에 적용되므로 대상 환경을 확인해 재배포한다. [Vercel 환경변수 문서](https://vercel.com/docs/environment-variables)

Node.js 와 프로젝트 의존성이 설치된 **호출 앱의 프로젝트 루트**에서 기존 읽기 전용 검증 스크립트를 실행한다. 이 명령은 `.env.local` 을 읽으므로 Vercel 대시보드 설정만으로 로컬 테스트 설정이 바뀌지는 않는다.

```bash
node --env-file=.env.local scripts/check-siglip-text-search.cjs
```

기본 검색어는 `푸른 숲속 커플 사진`, `어두운 실내 플래시 인물`, `바다에서 뛰는 사람` 이다. 각 검색어에서 위 모델·1152차원 검증을 통과하고 사진 ID·코사인 거리 목록이 나오는지 확인한다. 이 스크립트는 DB 데이터를 수정하지 않는다. **결과가 0건이어도 종료 코드가 0일 수 있으므로 목록까지 확인**한다.

실제 앱에서도 같은 검색어로 검색해 사진을 확인한다. 홈이 열리거나 검색 URL이 HTTP 200을 반환하는 것만으로는 벡터 검색 성공이 아니다. 현재 앱의 임베딩 요청 제한은 **4초**, 위 검증 스크립트는 **10초**이므로 스크립트가 성공해도 앱에서는 타임아웃이 날 수 있다. 외부 경로의 워밍된 `/embed-text` 요청 시간과 실제 검색 결과를 함께 확인한다.

앱의 서버 검색 결과 준비에는 DB 조회 등을 포함한 **8초 제한**도 적용한다. 사전 세션 갱신과 브라우저 타이머 등 구체적인 시간 기준은 [29 문서 §7](29-siglip-text-search.md#7-장애-처리)을 따른다.

> ⚠️ **실패 화면은 지금 설계와 다르다 (2026-09-18 확인).** 설계는 실패·지연 시 사진 영역에 `대기시간이 오래 걸립니다.`·`다시 시도` 를
> 띄우는 것이다(`SearchUnavailable`). 그러나 그 화면을 쓰는 `SearchPhotoResults` 는 어디서도 불리지 않고, 홈 검색은
> 실패를 삼켜 **"“검색어” 결과가 없어요"** 를 띄운다. 즉 **장애와 진짜 0건이 화면에서 구분되지 않는다.**
> 운영 검색이 전부 0건이면 먼저 맥미니·Funnel 장애를 의심한다. 화면 연결은 따로 고칠 일이다.

### 8.6 갱신·재시작·상태 확인

맥미니의 런타임 코드 또는 `.env.local` 을 바꿨다면 **등록된 상주 서비스를 재시작**한다. 이미 launchd 로 실행 중일 때 `python serve.py` 를 따로 띄우면 8077 포트가 충돌한다.

```bash
cd ~/srv/samae-app
launchctl kickstart -k "gui/$(id -u)/com.samae.serve"
launchctl list | grep -E 'com\.samae\.(embed|serve)'
tail -n 60 scripts/embed/logs/serve.log
tailscale funnel status
```

모델 준비 로그 이후 §8.3·§8.4·§8.5를 순서대로 확인한다. `com.samae.serve` 에는 실행 중인 PID 가 있어야 한다. `com.samae.embed` 는 배치 시간이 아닐 때 PID 가 `-` 인 것이 정상이다. 등록 자체가 없다면 §8.2의 setup 으로 돌아간다.

재부팅 후에도 같은 계정 로그인, Tailscale 연결, 두 LaunchAgent 등록, 인증된 `/health`·`/embed-text` 를 확인한다. `com.samae.serve` 를 내리면 검색과 기존 페르소나의 임베딩·프록시·작문 경로가 함께 영향을 받는다.

| 증상 | 확인할 곳 |
|---|---|
| 로컬 8077 연결 실패 | `serve.log` 의 모델 다운로드·로딩 오류, 실행 PID, macOS 로그인·슬립 상태 |
| `/health` 는 되지만 `/embed-text` 가 404 | 맥미니 런타임에 새 코드가 있는지와 갱신 후 서비스 재시작 여부 |
| 백필이 서버 준비 오류·`/embed-backfill` 404로 종료 | 같은 런타임의 새 서버를 재시작했는지, `/health`에 `inference_queue`가 있는지 확인 |
| 목적 백필의 `/embed-text-backfill`이 404 | §9 변경을 맥미니에 내려받고 상주 서비스를 재시작했는지 확인 |
| `/search-query` 가 404 | 옛 코드다. 갱신·재시작. 그동안 앱은 `/embed-text` 로 우회하므로 검색은 된다(목적 분리만 빠짐) |
| `/search-query` 가 501, `serve.log` 에 `검색어 분리 꺼짐` | 서버 venv 에 `kiwipiepy` 가 없다. §8.2 의 `pip install` 후 재시작. 앱은 `/embed-text` 로 우회 |
| `/health` 의 `purpose_nearest` 가 false | KURE-v1 을 안 받았거나 `SAMAE_PURPOSE_NEAREST=0` 이다. **장애가 아니다** — 사전에 없는 말만 목적으로 안 잡힌다 |
| 인증 요청이 401 | 양쪽 `PERSONA_SERVICE_TOKEN` 일치 여부, 맥미니 재시작과 앱 재시작·재배포 여부 |
| 로컬은 정상인데 HTTPS 경로 실패 | Tailscale 연결과 `funnel status` 의 실제 주소·8077 프록시 대상 |
| 검증 스크립트는 성공하지만 앱 검색 결과가 없음 | 앱의 URL·토큰·배포 환경, 4초 제한, 공개·승인·`feed_hidden=false` 조건 |
| RPC 오류 또는 벡터 후보 0건 | 기존 `similar_photos_by_vector` 배포 상태와 사진 임베딩 커버리지(`check_db.py`) |
| 운영에서 **모든** 검색이 "결과가 없어요" | 앱이 맥미니에 닿지 못한다 — 로컬 8077, Funnel 주소, 워밍된 응답 4초 미만, 토큰 순서로 확인 ([38](38-macmini-search-handoff.md) §5-3). Vercel 로그의 `[home] 검색 실패` 에 원인이 남는다 |

상주 서비스·Funnel 장애 시 **설계는** 사진 영역에 지연 안내와 재시도 버튼을 표시하는 것이지만, 현재 홈 검색은 이를 "결과가 없어요" 로 보인다(§8.5 경고). 사진→사진 추천은 저장된 사진 벡터를 사용한다. `/search-query`·`/embed-text` 와 실제 검색을 함께 점검한다.

이 절차는 저장소의 현재 실행 코드와 공식 CLI 문서를 기준으로 작성했다. 2026-09-14 Windows Docker/CUDA 환경에서는 같은 서버의 텍스트 추론·DB 검색과 대표 검색어 3개의 각 48장 서버 렌더링을 확인했다. **맥미니에서의 서비스 재시작·Funnel·운영 앱 연결은 위 절차로 별도 확인해야 한다.**

<a id="search-priority"></a>

### 8.7 오전 6시 백필 중 검색이 들어오면 (2026-09-14)

**상주 모델 하나를 공유하며 검색을 우선한다.** 백필 프로세스는 사진 다운로드와 DB 저장만 맡고, 추론은 `serve.py`에 요청한다. 기본 실행에서 백필용 모델을 따로 올리지 않는다.

| 순위 | 요청 | 처리 단위 |
|---|---|---|
| 1 | `/embed-text` 사용자 검색 | 요청에 포함된 검색어 (최대 8개) |
| 1 | `/search-query` 사용자 검색 (2026-09-18~) | 목적을 뗀 검색어 한 개. 목적만 있는 검색어는 추론 없이 바로 답한다. 사전에 없는 명사가 있으면 KURE-v1 호출이 먼저 붙는다(약 10ms, 같은 말은 기억) |
| 2 | `/embed` 사용자 이미지 | 기존 이미지 마이크로 배치 |
| 3 | `/embed-backfill` 자동 백필 | 사진 한 장 |
| 3 | `/embed-text-backfill` 목적 태그 백필 | 고정 목적 문장 최대 8개 |

예를 들어 백필 사진 A를 추론하는 동안 검색 S가 도착하면 **A 완료 → S 처리 → 백필 사진 B** 순서다. 같은 우선순위에서는 도착 순서를 따른다. 이미 실행 중인 추론은 중간에 끊지 않고 GPU 결과를 CPU로 회수한 뒤 차례를 넘긴다. 따라서 검색도 현재 사진 한 장이 끝날 때까지는 기다릴 수 있다. 사용자 이미지 추론이 이미 시작된 경우에는 그 배치 완료를 기다린다.

검색이 계속 밀려들면 백필 완료 시각은 늦어진다. 백필은 대기 중인 검색과 사용자 이미지 요청이 없어지면 이어서 진행한다. 백필 요청이 큐에서 60초를 기다리면 서버는 503을 반환하고, 클라이언트는 1초 간격으로 최대 5회 재시도한다. 이후에도 실패하면 그날 배치를 실패로 끝내고 기존 실패 알림 경로를 사용한다. 저장이 끝난 사진은 유지되며, 실패한 사진은 `embedded_at`을 기록하지 않아 다음 실행의 대상에 남는다.

검색의 **큐 대기 제한은 3초**다. 대기 시간이 넘으면 503으로 응답하고 대기열에서 제거한다. 이는 전체 응답 3초 보장을 뜻하지 않는다. 진행 중인 추론·네트워크 시간을 포함한 앱의 임베딩 요청 4초 제한은 유지되며, 오류·시간 초과 시 §8.5의 사진 영역 지연 안내를 표시한다.

운영 시 확인할 사항:

- 런타임 코드를 갱신한 후 §8.6대로 `com.samae.serve`를 재시작하고 §8.3 점검을 실행한다. **기존 독립 방식의 백필이 실행 중이면 먼저 그 회차가 끝난 뒤 전환**한다. 이미 실행된 프로세스는 파일 갱신만으로 바뀌지 않는다.
- `/health`의 `inference_queue.running`은 `search`, `interactive`, `backfill` 또는 `null`이다. `waiting`은 종류별 대기 수다. 검색어·사진 내용은 포함하지 않는다.
- 자동 백필 주소는 `http://127.0.0.1:8077`로 고정한다. 앱의 `PERSONA_EMBED_URL`과 별개이며, `.env.local`의 동일한 `PERSONA_SERVICE_TOKEN`으로 인증한다.
- 서버의 모델·1152차원·patch budget이 DB 저장 설정과 다르면 백필을 중단한다. 서버가 꺼졌거나 구버전인 경우에도 독립 모델로 자동 우회하지 않는다.
- `--batch-size`는 클라이언트의 준비 묶음 크기다. 공유 서버에는 항상 한 장씩 보낸다. `--standalone`은 상주 서버를 끈 오프라인 작업에만 쓰며 검색 우선순위가 적용되지 않는다.

동시 실행·인증·잘못된 벡터·실패 시 DB 미기록은 운영 DB와 모델 다운로드 없이 아래 테스트로 확인할 수 있다.

```bash
cd ~/srv/samae-app
scripts/embed/.venv/bin/python -m unittest discover -s scripts/embed -p 'test_*.py' -v
```

로컬 Windows Docker/CUDA에서 합성 사진 8장 백필과 검색 4건을 겹쳐 호출했고 모두 완료됐다. 백필 중 검색의 HTTP 응답은 **34.0~58.3ms**였으며, 기존 `/embed` 이미지 2장 요청도 정상 반환했다. 이 수치는 로컬 검증값이며 **맥미니 MPS·Funnel 환경의 응답 시간은 별도로 측정해야 한다.**

---

<a id="daily-purpose"></a>

## 9. 오전 6시 목적 태그 자동 백필 (2026-09-15)

기존 `com.samae.embed` 한 개가 **매일 맥미니 현지 시간 06:00**에 사진 임베딩과 목적 태그를 순서대로 실행한다. 한국 오전 6시 운영은 맥미니 시간대가 `Asia/Seoul`인 상태를 기준으로 한다. 별도 크론이나 두 번째 모델은 필요 없다.

### 9.1 대상과 보호 원칙

1. 공개 사진의 누락된 SigLIP2 이미지 임베딩을 먼저 저장한다.
2. 검수 완료·수동 지정 포트폴리오에 새로 추가된 공개 사진은 목적이 아직 비어 있고 검수·개별 예외가 없을 때만 포트폴리오의 목적 목록을 그대로 상속한다. 이 단계는 이미지 임베딩이 없어도 가능하다.
3. 공개·호환 임베딩 사진이 있는 **미검수 포트폴리오** 중 신규 사진, 구버전/미처리 목적, 분류 후 변경된 포트폴리오·사진·연결 상품을 확인한다. `updated_at`과 내부 상품 연결의 `assigned_at`이 분류 시각보다 뒤인 경우 재처리한다.
4. 기존 텍스트 우선 규칙과 SigLIP2를 사용해 자동 목적을 저장한다. **자동 목적은 한 개만** 선택하며, 여러 목적은 운영자가 검수할 때 지정한다. 강한 텍스트끼리 충돌하는 기존 예외는 미분류로 남겨 검수하도록 한다.

검수 완료·수동 지정 포트폴리오와 검수·수동·개별 예외 사진은 자동 재분류하지 않는다. 검수한 웨딩·반려동물 복수 목적도 보존한다. 미검수 포트폴리오를 분류하면 기존 원자 RPC가 개별 예외를 제외한 소속 사진에 목적을 상속하므로, 해당 포트폴리오의 비공개·임베딩 대기 사진도 같은 목적을 받는다. 분류 입력은 공개·호환 사진만 사용한다.

분류 버전은 `purpose-v5-daily`다. 기존 버전의 미검수 대상은 새 정책으로 한 번 처리하고, 이후 변화가 없으면 건너뛴다. 강한 텍스트 충돌도 처리 버전을 기록하므로 수정이 없는 한 매일 다시 계산하지 않는다. 검수 데이터는 전체 점수 분포의 읽기 전용 기준으로만 사용하며 투표·쓰기 대상에는 넣지 않는다. 카탈로그가 사진 한 장뿐이거나 분산이 없으면 코사인 점수로 한 후보를 고르고 낮은 확신도로 기록한다.

### 9.2 검색 우선순위와 실패 처리

목적 문장 56개(목적 7종 × 8개)를 `/embed-text-backfill`에 최대 8개씩 요청한다. 사용자 `/embed-text` 검색보다 낮은 백필 우선순위다. 진행 중인 한 묶음은 끝까지 실행하고, 기다리는 검색을 먼저 처리한 뒤 다음 묶음으로 넘어간다. 사진 벡터는 DB에 저장된 값을 재사용한다.

사진 임베딩 일부가 실패해도 목적 단계는 이미 저장된 벡터로 진행한다. 목적 저장 일부가 실패해도 다른 포트폴리오는 계속 처리한다. **두 단계 중 하나라도 실패하면 전체 배치는 실패**이며, 단계별 종료 코드를 같은 로그에 남기고 기존 실패 알림 경로를 사용한다. 실패한 목적은 처리 버전이 갱신되지 않아 다음 실행에서 재시도한다. 처리 대상 0개는 정상 종료이고 상주 모델을 호출하지 않는다.

### 9.3 기존 맥미니에 반영

DB에는 `0116`·`0117` 이후 [0118 마이그레이션](../supabase/migrations/0118_daily_photo_purpose_inheritance.sql)이 필요하다. `0118`은 서비스 전용 목적 상속 함수와 내부 상품 연결 해제·삭제 시 앨범 수정 시각을 갱신하는 트리거를 추가한다. 마이그레이션 실행 자체로 기존 목적 데이터를 변경하지 않는다. 연결이 사라진 경우도 다음 배치가 재분류 대상으로 감지하되 작가의 상품 선택과 검수 목적은 보존한다. 적용 이력을 확인하고 아직 적용되지 않은 DB에만 프로젝트의 마이그레이션 실행기로 적용한다.

```bash
node scripts/apply-migration.cjs supabase/migrations/0118_daily_photo_purpose_inheritance.sql
```

변경이 원격 브랜치에 반영된 뒤, 맥미니의 운영 런타임에서 그 브랜치를 갱신한다. 실행 중인 이전 회차가 있다면 종료 후 갱신한다.

```bash
cd ~/srv/samae-app
git status --short --branch
git pull --ff-only
launchctl kickstart -k "gui/$(id -u)/com.samae.serve"
launchctl list | grep -E 'com\.samae\.(embed|serve)'
```

§8.3의 검색 점검 후, 아래 명령으로 신규 목적 엔드포인트를 점검한다. 토큰·벡터는 출력하지 않는다.

```bash
scripts/embed/.venv/bin/python - <<'PY'
import sys
sys.path.insert(0, "scripts/embed")
from backfill_client import BackfillClient
from purpose_backfill import load_env
client = BackfillClient("http://127.0.0.1:8077", load_env()["PERSONA_SERVICE_TOKEN"], 256)
client.check_health()
vectors = client.embed_texts(["A wedding photography session."])
print("목적 백필 엔드포인트 정상:", len(vectors), "문장 /", len(vectors[0]), "차원")
PY
```

읽기 전용으로 대상·산출물을 먼저 확인하거나, 전체 체인을 한 번 실행한다. `--daily`만 쓰면 DB 쓰기가 없으며 검수 목적 상속도 실행하지 않는다.

```bash
# 읽기 전용 목적 점검
scripts/embed/.venv/bin/python scripts/embed/purpose_backfill.py --daily \
  --output scripts/embed/logs/purpose-preview

# 실제 사진 임베딩 + 목적 저장 (오전 6시와 동일)
bash scripts/embed/run-embed.sh
```

기존 등록 시각은 변경하지 않았으므로 LaunchAgent 재등록은 필요 없다. 설치가 없는 기계만 §4 setup을 실행한다. 새 목적 엔드포인트는 실행 중인 서버에 자동 반영되지 않으므로 **상주 서비스 재시작을 생략하지 않는다.**

### 9.4 결과 확인

- `scripts/embed/logs/embed-YYYYMMDD-HHMMSS.log`: 두 단계 결과, 상속 장수, 처리/실패 포트폴리오 수, 각 종료 코드. 최근 14회 유지.
- `scripts/embed/logs/purpose-latest/purpose-result.json`: 최근 목적 단계의 처리·미분류·실패·사진 갱신·상속 수와 버전. 분류/상속 완료 후 갱신되므로 시작 도중 오류라면 이전 파일이 남을 수 있고 해당 회차 로그를 확인한다.
- 같은 폴더의 `purpose-predictions.json`, `purpose-summary.csv`, `contact-sheet-manifest.json`: 최근 후보·근거. 자동 실행에서는 검토용 이미지 시트의 사진 다운로드를 생략한다.

`purpose-result.json`의 `updated_photos`는 목적 분류 RPC의 사진 갱신 수, `inherited_photos`는 검수 목적 상속 수다. 검수 상태를 임의로 해제해서 일일 작업을 시험하지 않는다. 단일 신규 사진, 검수/예외 보호, 검색 우선순위, 빈 대상, 부분 실패는 §8.7의 Python 테스트와 [격리 SQL 테스트](../supabase/tests/purpose-daily-inheritance.sql)로 확인한다.

2026-09-15 실제 앱 DB에 `0118` 적용 및 이력 기록을 완료했다. 적용 전후 포트폴리오·사진의 전체 행 해시가 동일했고, 서비스 역할의 상속·재실행 0건과 일반 사용자 호출 거부를 검증했다. 시험 데이터 변경은 전부 롤백했다. 로컬 Windows Docker/CUDA의 새 백필 텍스트 엔드포인트와 기존 검색 모두 1152차원 정규화 벡터를 반환했으며, 실제 DB 일일 dry-run은 보호 대상 173개·분류 대상 0장으로 정상 종료했다. **이 검증은 맥미니 런타임 갱신·재시작이나 오전 6시 실운영 실행을 대신하지 않는다.**

# Search Priority Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 오전 06:00 사진 백필 중에도 대기 중인 검색 추론을 먼저 처리한다.

**Architecture:** `serve.py`의 모델 하나를 공유한다. 추론 차례는 검색 → 사용자 이미지 → 백필 순서이고 같은 우선순위에서는 도착 순서다. 실행 중인 추론은 완료하며, 백필 요청은 사진 한 장으로 제한한다. CPU로 결과를 회수할 때까지 차례를 유지한다.

**Tech Stack:** Python 표준 라이브러리 threading/HTTP/unittest, 기존 SigLIP2/PyTorch, launchd/bash.

**Spec:** 사용자가 승인한 검색 우선 처리와 [운영 가이드](../../28-embedding-batch-automation.md#search-server).

## Global Constraints

- 기존 `/embed`, `/embed-text`, 서비스 토큰 인증을 유지한다.
- 모델 `google/siglip2-so400m-patch16-naflex`, 1152차원, 기본 patch budget 256을 유지한다.
- 자동 백필은 상주 서버를 호출하며, 서버 장애 시 별도 모델을 로드하지 않는다.
- `--apply` 없는 실행은 DB를 수정하지 않는다. 검증에는 운영 DB 쓰기와 알림 발송을 사용하지 않는다.
- 사용자 지정 `dev2`에서 작업하고 기존 문서 변경을 보존한다.

## Task 1: 공유 모델의 추론 우선순위

Files: 새 `scripts/embed/inference_queue.py`, `test_inference_priority.py`; 수정 `serve.py`.

- [x] 경쟁하는 실제 스레드에서 실행 중인 작업 완료 후 검색, 사용자 이미지, 백필 순서가 되는 테스트를 작성하고 실패를 확인한다. 같은 순위 FIFO, 예외 이후 복구, 대기 시간 초과의 큐 제거도 확인한다.
- [x] `InferenceQueue.slot(priority, timeout)` 컨텍스트와 운영용 `snapshot()`을 구현한다. Condition과 순서 번호로 대기자를 관리한다.
- [x] 텍스트 추론과 이미지 워커를 같은 큐로 보호한다. `/embed-backfill`은 이미지 한 장만 허용하고 기존 인증을 적용한다. 대기 만료는 HTTP 503으로 응답한다.
- [x] HTTP 테스트로 인증, 한 장 제한, 모델/차원/budget 응답과 검색 우선 실행을 검증한다.

```python
# 작업 순서의 독립적인 기대값
assert order == ["running", "search-1", "search-2", "interactive", "backfill"]
# GPU 동기화도 직렬화된 구간 안에서 완료
with inference.slot("search", timeout=3):
    rows = siglip.encode_text(processor, model, texts, device).cpu().tolist()
```

## Task 2: 자동 백필을 상주 서버에 연결

Files: 새 `scripts/embed/backfill_client.py`, `test_backfill_client.py`; 수정 `embed_photos.py`, `run-embed.sh`.

- [x] 로컬 HTTP 서버를 이용해 토큰 전달, 한 장씩 전송, 메타데이터/벡터 검증 실패, 503 재시도, 서버 중단 시 DB 미기록 테스트를 작성하고 실패를 확인한다.
- [x] `BackfillClient(url, token, budget)`의 `check_health()`와 `embed(image_bytes)`를 구현한다. 응답의 모델, 차원, budget, 벡터 수와 유한 숫자를 검사한다.
- [x] 백필은 기본으로 `http://127.0.0.1:8077`을 사용한다. 별도 모델은 명시적인 `--standalone`에서만 로드한다. 정상 반환된 벡터만 기존 `write_one`으로 즉시 저장한다.
- [x] 자동 실행 래퍼에 로컬 URL을 명시하고, 격리한 가짜 Python 실행 파일로 래퍼의 인수와 실패 종료코드를 확인한다.

```bash
python -m unittest discover -s scripts/embed -p 'test_*.py' -v
bash -n scripts/embed/run-embed.sh
```

## Task 3: 운영 안내와 실제 모델 검증

Files: 수정 `docs/28-embedding-batch-automation.md`, `docs/29-siglip-text-search.md`.

- [x] 운영 가이드에 검색 우선 순서, 사진 한 장 이후 양보, 지속 검색 시 백필 지연, 서버 필수 조건, 갱신·재시작 순서를 기록한다.
- [x] 로컬 Docker 서버를 재시작하고 합성 이미지 백필 요청과 검색을 함께 호출한다. `/health`와 검색 smoke test를 확인한다.
- [x] `git diff --check` 및 변경 범위 검토를 수행한다. 맥미니 배포와 그 장비에서의 지연 측정은 별도 적용이 필요함을 보고한다.

## Verification results

- Python 전체 23개 테스트 통과. 우선순위 동시 실행, HTTP 계약, 백필 DB 기록 범위, 손상 JPEG 건너뛰기, 토큰 없는 설치 거부, 래퍼 종료코드를 검증했다.
- 실제 CUDA 모델에서 합성 사진 8장 백필과 검색 4건 완료. 겹친 검색 HTTP 응답 34.0~58.3ms. 기존 이미지 API 2장 응답 정상.
- 기존 읽기 전용 검색 스크립트의 한국어 검색어 3개가 각각 DB 결과 8개를 반환했다.
- 리뷰에서 발견한 JPEG 디코딩과 설치 전제조건 문제를 수정하고 재검토했다.
- 맥미니에는 아직 반영하지 않았다. 원격 반영 후 런타임 갱신·상주 서비스 재시작과 MPS/Funnel 검증이 필요하다.

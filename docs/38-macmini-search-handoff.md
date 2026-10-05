# 38. 맥미니 작업 지시 — 실시간 검색·목적 태그 붙이기 (2026-09-17, 2026-09-18 · 2026-09-23 갱신)

> **읽는 사람에게.** 이 문서는 맥미니에서 명령을 실행하는 사람(또는 에이전트)을 위한 것이다.
> 위에서부터 순서대로 하면 된다. **각 단계마다 "이러면 정상 / 이러면 멈춘다" 를 적어뒀다.**
> 판정 기준에 안 맞으면 다음 단계로 넘어가지 말고 그 자리에서 멈추고 보고할 것.
>
> 배경 설명은 [docs/28 §8·§9](28-embedding-batch-automation.md) 에 있다. 이 문서는 **실행 순서**만 다룬다.

---

## 0. 먼저 알아야 할 것

맥미니는 이 서비스의 **AI 런타임**이다. 두 가지를 한다.

| | 무엇 | 언제 |
|---|---|---|
| **상주 서버** `com.samae.serve` | SigLIP2 모델을 메모리에 올려두고 검색어를 벡터로 바꿔준다 (포트 8077) | 항상 |
| **배치** `com.samae.embed` | 새 사진 임베딩 → 사진 목적 태그 → 무드 검색 목록 → 세부분류 · 성별 초안 | 매일 06:00 |

필요한 코드는 **PR #356(2026-09-17)·#372(2026-09-18) 로 `main` 에 모두 들어왔다.** 지금 실행해도 된다.
2026-09-23 변경(배치 4단계 세부분류 · 성별 초안)은 **그 PR 이 `main` 에 합쳐진 뒤에** 이 문서를 처음부터 따라 한다.

> 🚨 **운영 검색은 이제 맥미니 하나에 달려 있다 (2026-09-18 15:41 배포부터).**
> 전에는 앱이 태그 검색 결과를 함께 보여줘서, 맥미니에 닿지 않아도 화면이 비지 않았다.
> #372 부터 검색 결과는 **SigLIP 으로만** 만든다. 앱이 맥미니에 닿지 못하면(꺼짐·Funnel 끊김·4초 초과·토큰 불일치)
> **모든 검색이 "결과가 없어요" 로 뜬다.** 2026-09-18 배포 직후 운영에서 실제로 그렇게 됐다.
> 그래서 이번에는 **바깥(Funnel) 주소에서 되는지**까지 반드시 확인한다 (§5-3).

**무엇이 새로 생기는가**

- `/search-query` — 검색어에서 **사진 목적을 떼어**(`가을 커플스냅` → 목적 커플 + "가을") 나머지만 벡터로 돌려준다.
  개인 사진을 성별로 찾으면(`여자`, `남자 노을`) 성별도 알려준다 — 앱이 여자/남자 사진을 가른다([docs/29 §12.9](29-siglip-text-search.md))
  세부분류도 함께 준다(`만삭` → 행사·만삭). 사전에 없는 말은 §3-2 모델이 있으면 가장 가까운 사전 말의 목적으로 보낸다
  형태소 분석기 **Kiwi(`kiwipiepy`)** 가 필요하다. 새 파이썬 패키지라 **`git pull` 만으로는 안 깔린다** (§3-1)
- `/embed-text-backfill` — 배치 전용 임베딩 창구. 사용자 검색보다 **낮은 우선순위**라
  오전 6시 배치가 돌아도 고객 검색이 안 밀린다
- 오전 6시 배치에 **목적 태그 단계**가 붙는다 (사진 임베딩 → 목적 분류 순서)
- **(2026-09-23)** 오전 6시 배치 끝에 **4단계 세부분류 · 성별 초안**(`purpose_drafts.py`)이 붙는다.
  목적이 붙은 포트폴리오 중 세부분류나 성별이 **비어 있는 것만** 초안(auto)으로 채운다 — 사람이 정한 값은 안 건드린다.
  글 단서를 `/search-query` 로 읽으므로 **Kiwi 가 없으면 이 단계가 실패한다**(§3-1). 초안은 검수 전 보조 값이라
  이 단계가 실패해도 배치는 성공으로 끝나고 **디스코드로 알리지 않는다** — 로그에만 `⚠️ 초안 단계 실패` 가 남는다.
  전에는 이 단계가 없어서, 2026-09-18 이후 올라온 포트폴리오는 목적만 붙고 세부분류 · 성별이 비어 있었다
  ([docs/39 §7.4](39-photo-purpose-taxonomy.md)). 그때까지 비어 있던 8개는 2026-09-23 Windows PC 에서 같은 스크립트로 채웠다

**맥미니가 갱신 전이어도 검색은 된다 — 닿기만 하면.** 옛 서버는 `/search-query` 에 404 를,
Kiwi 가 없는 새 서버는 501 을 준다. 앱은 둘 다 "모르는 기능" 으로 보고 예전처럼 검색어 통째로
`/embed-text` 에 넣는다(목적 분리만 빠진다). 2026-09-18 옛 서버 흉내(404)로 운영 조건에서 확인했다.

**이미 되어 있는 것 (건드리지 말 것)**

- DB 마이그레이션 `0116`·`0117`·`0118` — 2026-09-15 적용 완료
- DB 마이그레이션 `0121` — 2026-09-17 적용 완료
- DB 마이그레이션 `0130` — 2026-09-18 적용 완료 (유사사진 함수 중복 정리)
- DB 마이그레이션 `0131` — 2026-09-18 적용 완료 (성별 필터용. 검색 화면의 z 컷은 앱에서 꺼 둠)
- launchd 등록 (`com.samae.embed`·`com.samae.serve`) — 2026-08-21 완료. **재등록 불필요**

**하지 않는 것** — 이 문서에는 DB 쓰기가 없다. 마이그레이션은 전부 적용돼 있다.

---

## 1. 지금 상태 먼저 찍기

갱신 **전에** 무엇이 돌고 있었는지 남긴다. 나중에 문제가 생기면 이 출력이 기준이 된다.

```bash
cd ~/srv/samae-app
git log --oneline -1
git branch --show-current
grep -c purpose_backfill scripts/embed/run-embed.sh || true
grep -c search-query scripts/embed/serve.py || true
launchctl list | grep -E 'com\.samae\.(embed|serve)'
curl -s localhost:8077/health
tailscale funnel status
```

**예상** — 브랜치는 `main`, launchd 두 항목이 보이고, `/health` 가 `{"ok": true, "device": "mps", ...}` 를 준다.
`grep -c` 두 개는 `0` 이어도 `1` 이상이어도 된다 — 어느 판이 돌고 있었는지 남기는 것이다.
`funnel status` 에는 `https://…ts.net` 주소가 `http://127.0.0.1:8077` 로 이어져 있어야 한다.

**멈출 때**
- 브랜치가 `main` 이 아니면 → 멈추고 보고. 다른 작업 중일 수 있다
- `/health` 가 응답이 없으면 → 상주 서버가 죽은 것이다. **지금 운영 검색이 전부 비어 있을 수 있다.** 그것부터 보고 (§6)
- `funnel status` 에 8077 연결이 없으면 → 운영 앱이 맥미니에 닿지 못하는 상태다. 멈추고 보고 ([docs/28 §8.4](28-embedding-batch-automation.md))

---

## 2. 배치가 돌고 있지 않은지 확인

오전 6시 배치가 실행 중일 때 코드를 갈아치우면 그 회차가 깨진다.

```bash
pgrep -fl "embed_photos.py|purpose_backfill.py|build_search_tags.py|purpose_drafts.py|run-embed.sh" || echo "돌고 있지 않음"
ls -t ~/srv/samae-app/scripts/embed/logs/ | head -3
```

**정상** — "돌고 있지 않음" 이 찍힌다.
**멈출 때** — 뭔가 돌고 있으면 **끝날 때까지 기다린다.** 죽이지 말 것. 보통 1~2분이면 끝난다.

---

## 3. 코드 갱신

```bash
cd ~/srv/samae-app
git status --short --branch
git pull --ff-only
git log --oneline -1
```

**정상** — `git status` 가 깨끗하고(수정된 파일 없음), `pull` 이 fast-forward 로 끝난다.

**멈출 때**
- 수정된 파일이 있으면 → 멈추고 보고. **덮어쓰지 말 것.** 누가 손으로 고쳐둔 것일 수 있다
- `pull` 이 fast-forward 가 아니라고 거부하면 → 멈추고 보고. `--force` 를 쓰지 말 것

**갱신이 됐는지 확인**

```bash
grep -c purpose_backfill scripts/embed/run-embed.sh
grep -c 'embed-text-backfill' scripts/embed/serve.py
grep -c 'search-query' scripts/embed/serve.py
grep -c purpose_drafts scripts/embed/run-embed.sh
ls scripts/embed/query_parse.py scripts/embed/purpose_drafts.py
```

`grep -c` 넷 다 **1 이상**, 두 파일이 있어야 한다. 아니면 아직 옛 코드다 — `git log` 에 #372 와 세부분류 · 성별 초안 PR 이 있는지 확인할 것.

### 3-1. 검색어 분리기(Kiwi) 설치

`requirements.txt` 에 `kiwipiepy` 가 새로 들어왔다. **맥미니 venv 에 한 번 설치**한다.
모델 파일이 패키지 안에 들어 있어 따로 내려받는 것은 없다(설치 수십 MB, 메모리 약 0.6GB, 올리는 데 1초 미만).

```bash
cd ~/srv/samae-app
scripts/embed/.venv/bin/pip install -r scripts/embed/requirements.txt
scripts/embed/.venv/bin/python -c "import kiwipiepy; print('kiwipiepy', kiwipiepy.__version__)"
```

**정상** — `kiwipiepy 0.23` 이상이 찍힌다. 나머지 패키지(torch·transformers 등)는 이미 깔려 있어 "already satisfied" 로 넘어간다.

**멈출 때**
- torch·transformers 가 **새로 받아지거나 버전이 바뀌면** → 멈추고 보고. 모델 결과가 달라질 수 있다
- 설치 오류 → 멈추고 보고. **설치가 안 돼도 상주 서버는 뜬다**(목적 분리만 꺼진 채). 억지로 고치지 말 것

### 3-2. 목적 가까움 비교 모델 (선택 — 안 받아도 검색은 된다)

검색어가 사전에 없을 때 **뜻이 가장 가까운 사전 말의 목적**으로 보내는 기능이다("학사모" → 졸업, "예식장" → 본식).
한국어 임베딩 모델 `nlpai-lab/KURE-v1`(MIT) 을 쓴다 — 받는 파일 약 2.2GB, 메모리 약 **1.5GB 더**(반정밀도 — 2026-09-21 실측: SigLIP만 1.17GB → 함께 2.62GB).

**안 받아도 된다.** 그때는 사전에 있는 말만 목적으로 잡고 나머지는 지금처럼 무드로 넘어간다. 상주 서버는
**받아 둔 모델만** 쓴다 — 켜질 때 몰래 내려받지 않는다.

```bash
cd ~/srv/samae-app
scripts/embed/.venv/bin/python - <<'PY'
from huggingface_hub import snapshot_download
path = snapshot_download("nlpai-lab/KURE-v1")
print("받음:", path)
PY
```

**정상** — 몇 분 뒤 `받음: /Users/…/huggingface/hub/models--nlpai-lab--KURE-v1/…` 이 찍힌다.

**멈출 때**
- 디스크가 모자라면 → 받지 말고 넘어간다. 검색은 사전만으로 돈다
- 메모리가 빠듯하면(다른 작업과 함께) → `.env.local` 에 `SAMAE_PURPOSE_NEAREST=0` 을 넣어 꺼 둔다

### 3-3. Ollama(qwen) 끄기 — 맥미니에서는 돌리지 않는다

**맥미니에서는 qwen 을 돌리지 않는다(2026-09-21 결정 — 무겁다).** 8/21 설치 때 페르소나 작문용으로 켜 둔
Ollama 자동시작을 끈다. 페르소나 결과 문장은 claude 가 쓴다 — 서비스는 안 깨진다.

```bash
brew services stop ollama
brew services list | grep ollama || echo "ollama 없음"
pgrep -fl ollama || echo "돌고 있지 않음"
```

**정상** — `ollama … none`(또는 `stopped`) 이 찍히고, 마지막 줄이 `돌고 있지 않음` 이다.
`serve.py` 의 `/persona_copy` 도 기본으로 꺼져 있다(§4 로그에 `⏸  페르소나 작문(qwen) 꺼 둠`).

**멈출 때** — `brew` 가 없다고 하거나 ollama 가 다른 방식(앱·직접 실행)으로 떠 있으면 → 끄지 말고 어떻게 떠 있는지 보고.

**분리기 자체 점검** (DB·모델 없이 1초):

```bash
cd ~/srv/samae-app/scripts/embed
.venv/bin/python -m unittest test_query_parse -v
cd ~/srv/samae-app
```

**정상** — 전부 `ok`, 마지막 줄 `OK` (2026-09-18 기준 23개).

### 3-4. 무드 태그 검색 목록 처음 한 번 만들기 (2026-09-21)

오전 6시 배치가 이제 **무드 태그 검색용 사진 목록**을 만든다(`[3/4]`, docs/29 §12.15).
다음 6시를 기다리지 않게 지금 한 번 만든다. 사진 표는 읽기만 하고 `search_tag_snapshot` 한 줄만 쓴다.

```bash
cd ~/srv/samae-app
scripts/embed/.venv/bin/python scripts/embed/build_search_tags.py            # 미리보기 — 쓰지 않는다
scripts/embed/.venv/bin/python scripts/embed/build_search_tags.py --apply
```

**정상** — 첫 줄이 `무드 태그 검색 목록: 사진 1601장 · 앨범 161개 · 작가 10명 · 1252KB` 처럼 찍히고
(숫자는 그날 사진 수에 따라 다르다), `--apply` 뒤 `✅ search_tag_snapshot 저장` 이 찍힌다.

**멈출 때** — `404` 나 `relation "search_tag_snapshot" does not exist` 가 나오면 DB 에 0138 이 아직 없다 → 멈추고 보고.
앱은 목록이 없어도 예전처럼 돈다 — 급하지 않다.

---

## 4. 상주 서버 재시작

**이 단계를 생략하면 안 된다.** 상주 서버는 모델과 코드를 **메모리에 올려둔 채** 돌기 때문에,
`git pull` 만으로는 새 엔드포인트가 반영되지 않는다.

```bash
launchctl kickstart -k "gui/$(id -u)/com.samae.serve"
```

모델을 다시 올리는 데 **10~20초** 걸린다. 준비될 때까지 기다린다.

```bash
until curl -s localhost:8077/health >/dev/null 2>&1; do sleep 2; done
curl -s localhost:8077/health
```

**정상** — `{"ok": true, "device": "mps", "model": "google/siglip2-so400m-patch16-naflex", "dim": 1152, ...}`
`purpose_nearest` 가 §3-2 를 했으면 `true`, 안 했으면 `false` 다.

검색어 분리기가 같이 올라왔는지 로그로 본다.

```bash
grep -E "검색어 분리|가까움 비교" scripts/embed/logs/serve.log | tail -3
```

**정상** — `✅ 검색어 분리 준비` 가 있고 `⚠️  검색어 분리 꺼짐` 이 **없다.** 있으면 §3-1 설치가 이 venv 에 안 된 것이다.
가까움 비교는 §3-2 를 했으면 `✅ 목적 가까움 비교 준비 …(예시 159개)`, 안 했으면 `⚠️  목적 가까움 비교 꺼짐` 이다 —
**꺼져 있어도 정상이다.**

**멈출 때**
- `device` 가 `mps` 가 아니면 → 멈추고 보고. CPU 로 떨어지면 몇 배 느려진다
- 1분이 지나도 `/health` 가 안 뜨면 → 멈추고 로그를 보고 (§6)

---

## 5. 엔드포인트 점검

### 5-0. 검색어 분리 `/search-query`

**운영 검색이 쓰는 창구다.** 토큰은 `.env.local` 에서 읽고, **토큰과 벡터 값은 출력하지 않는다** (벡터는 길이만).

```bash
cd ~/srv/samae-app
check_search_query() {
  scripts/embed/.venv/bin/python - "$1" <<'PY'
import json, sys, time, urllib.request
sys.path.insert(0, "scripts/embed")
from check_db import load_env
base = sys.argv[1].rstrip("/")
token = load_env(".env.local").get("PERSONA_SERVICE_TOKEN", "")
if not token:
    raise SystemExit(".env.local 에 PERSONA_SERVICE_TOKEN 이 없다 — 멈추고 보고")
for query in ["가을 커플스냅", "웨딩", "몽환적인 노을", "남자 노을", "학사모"]:
    req = urllib.request.Request(base + "/search-query", data=json.dumps({"query": query}).encode(),
        headers={"x-samae-token": token, "Content-Type": "application/json"})
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=10) as r:
        d = json.load(r)
    ms = round((time.perf_counter() - started) * 1000)
    print(f"{query} → 목적 {d['purposes']} {d.get('details') or ''} / 성별 {d.get('gender')} / 글자 '{d['mood_text']}' / 벡터 {len(d['vector']) if d['vector'] else None} / {ms}ms")
PY
}
check_search_query http://127.0.0.1:8077
```

**정상**

```
가을 커플스냅 → 목적 ['couple'] / 성별 None / 글자 '가을' / 벡터 1152 / …ms
웨딩 → 목적 ['wedding'] / 성별 None / 글자 '' / 벡터 None / …ms
몽환적인 노을 → 목적 [] / 성별 None / 글자 '몽환적인 노을' / 벡터 1152 / …ms
남자 노을 → 목적 ['personal'] / 성별 male / 글자 '노을' / 벡터 1152 / …ms
학사모 → 목적 ['event'] ['event.graduation'] / 성별 None / 글자 '' / 벡터 None / …ms
```

마지막 줄(`학사모`)은 **§3-2 를 했을 때만** 목적이 잡힌다. 안 했으면 `목적 [] … 글자 '학사모'` 가 정상이다.

`웨딩` 처럼 목적만 있는 검색은 벡터가 `None` 인 게 정상이다(SigLIP 을 안 쓴다).

**멈출 때**
- `501` → Kiwi 가 없다. §3-1 로 돌아갈 것
- `404` → 새 코드가 안 올라왔거나 재시작을 안 했다. §3·§4 로 돌아갈 것
- `401` → 토큰이 안 맞는다

### 5-1. 목적 백필용 `/embed-text-backfill`

`PERSONA_SERVICE_TOKEN` 은 `~/srv/samae-app/.env.local` 에 있다. **토큰과 벡터 값은 출력하지 말 것.**

```bash
cd ~/srv/samae-app
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

**정상** — `목적 백필 엔드포인트 정상: 1 문장 / 1152 차원`

**멈출 때**
- `401`·`403` → 토큰이 안 맞는다. `.env.local` 의 `PERSONA_SERVICE_TOKEN` 확인
- `404` → 코드가 안 올라갔다. §3 으로 돌아갈 것
- 차원이 1152 가 아니면 → 멈추고 보고. 모델이 바뀐 것이다

### 5-2. 읽기 전용 목적 점검

**DB 에 쓰지 않는다.** `--apply` 가 없으면 미리보기다.

```bash
scripts/embed/.venv/bin/python scripts/embed/purpose_backfill.py --daily \
  --output scripts/embed/logs/purpose-preview
```

**정상** — 오류 없이 끝나고 `scripts/embed/logs/purpose-preview/` 에 결과 파일이 생긴다.
처리 대상이 **0장이어도 정상**이다(이미 다 처리된 상태).

### 5-4. 읽기 전용 세부분류 · 성별 초안 점검 (2026-09-23)

**DB 에 쓰지 않는다.** 배치 4단계와 같은 스크립트를 `--apply` 없이 돌린다.

```bash
scripts/embed/.venv/bin/python scripts/embed/purpose_drafts.py --daily
```

**정상** — `모드 DRY-RUN DAILY` 로 시작해 `세부분류 초안 N개` · `성별 초안 N개` 를 찍고
`DB 쓰기 없음` 으로 끝난다. **0개여도 정상**이다 — 2026-09-23 에 비어 있던 것을 다 채웠다.
그 뒤에 새로 올라와 목적이 붙은 포트폴리오가 있으면 그만큼 나온다.

**멈출 때**
- `백필 서버 /search-query: HTTP 501` → 서버에 Kiwi 가 없다. §3-1 · §4 로 돌아갈 것.
  이대로 두면 오전 6시 배치 4단계가 매일 조용히 실패한다(알림이 없으니 여기서 잡아야 한다)
- `PERSONA_SERVICE_TOKEN 이 필요합니다` → `.env.local` 에 토큰이 없다. 멈추고 보고
- `남성으로 잡힌 포트폴리오` 줄이 많이 나오면 → 멈출 일은 아니다. 수와 함께 보고(검수 때 먼저 볼 것)

### 5-3. 바깥 주소(Funnel)에서 — 운영 앱이 실제로 부르는 길

**이게 통과해야 운영 검색이 산다.** 맥미니 안에서 되는 것과 운영 앱이 닿는 것은 다르다.
`tailscale funnel status` 에 나온 `https://…ts.net` 주소를 넣는다(끝에 경로를 붙이지 않는다).

```bash
FUNNEL=https://YOUR-MACMINI.YOUR-TAILNET.ts.net   # funnel status 의 실제 주소로 바꾼다
curl -s -o /dev/null -w '토큰 없이: %{http_code}\n' "$FUNNEL/health"
check_search_query "$FUNNEL"
```

**정상**
- `토큰 없이: 401` — 공개 주소가 인증을 요구한다
- §5-0 과 같은 네 줄이 나오고, **ms 가 모두 4000 미만** — 앱은 4초를 넘기면 포기한다.
  첫 요청은 느릴 수 있으니 한 번 더 돌려 두 번째 값을 본다

**멈출 때**
- 연결이 안 되거나 시간 초과 → Funnel 이 끊긴 것이다. `tailscale funnel status` 와 함께 보고
- 두 번째 실행도 4000ms 이상 → 운영에서 검색이 비어 보인다. 수치와 함께 보고
- `401` 이 아니라 `200` → 공개 주소에 인증이 없다. 멈추고 보고

---

## 6. 안 될 때 볼 곳

```bash
# 상주 서버 로그
tail -50 ~/srv/samae-app/scripts/embed/logs/serve.log

# 배치 로그 (최근 것)
ls -t ~/srv/samae-app/scripts/embed/logs/embed-*.log | head -1 | xargs tail -50

# launchd 가 이 서비스를 어떻게 보고 있나
launchctl print "gui/$(id -u)/com.samae.serve" | head -30
```

자주 나오는 것

| 증상 | 원인 |
|---|---|
| `/health` 가 영영 안 뜸 | 모델 캐시가 없어 내려받는 중일 수 있다. 첫 실행이면 몇 분 걸린다 |
| `device: cpu` | MPS 를 못 잡았다. 재시작으로 대개 해결. 반복되면 보고 |
| `Operation not permitted` | macOS TCC(파일 접근 권한). `~/srv` 밖 경로를 쓰면 난다 — [docs/28 §4](28-embedding-batch-automation.md) |
| 배치가 조용히 아무것도 안 함 | 처리 대상 0장이면 정상이다. 로그의 종료 코드를 볼 것 |
| `serve.log` 에 `검색어 분리 꺼짐` | 서버가 쓰는 venv 에 `kiwipiepy` 가 없다. §3-1 을 `scripts/embed/.venv` 로 했는지 확인 |
| 맥미니 안에서는 되는데 운영 검색이 전부 "결과가 없어요" | 운영 앱이 맥미니에 닿지 못한다. §5-3 — Funnel·4초·토큰 순으로 본다 |

---

## 7. 끝나고 남길 것

아래를 그대로 회신하면 된다. **토큰·벡터·사진 URL 은 빼고.**

```
1. 갱신 전 커밋:      (§1 의 git log 첫 줄)
2. 갱신 후 커밋:      (§3 의 git log 첫 줄)
3. kiwipiepy:         (§3-1 의 버전 줄, 분리기 테스트 통과 수)
   가까움 비교 모델:   (§3-2 를 했는지 — 받음 / 안 받음)
   Ollama:            (§3-3 의 brew services list 줄, pgrep 결과)
   무드 검색 목록:     (§3-4 의 첫 줄과 ✅ 줄)
4. 상주 서버 /health: (§4 의 출력, "검색어 분리 꺼짐" 이 없었는지)
5. /search-query:     (§5-0 의 네 줄)
6. /embed-text-backfill: (§5-1 의 출력 한 줄)
7. 목적 미리보기:     (§5-2 의 처리 대상 수)
8. 초안 미리보기:     (§5-4 의 세부분류 · 성별 초안 수)
9. 바깥 주소:         (§5-3 의 401 여부와 두 번째 실행 네 줄 — 주소는 빼고)
10. 멈춘 단계가 있으면: 몇 번에서 무엇 때문에
```

그리고 **다음 날 오전 6시 배치가 정상으로 끝났는지**를 한 번 더 확인해야 한다. 이게 실제 확인이다.

```bash
ls -t ~/srv/samae-app/scripts/embed/logs/embed-*.log | head -1 | xargs tail -30
cat ~/srv/samae-app/scripts/embed/logs/purpose-latest/purpose-result.json
```

`purpose-result.json` 에 `updated_photos`(목적이 붙은 사진 수)와 `inherited_photos`(검수 목적을
물려받은 수)가 있다. **둘 다 0 이어도 정상**이다 — 새로 할 일이 없었다는 뜻이다. 중요한 건
**네 단계의 종료 코드가 모두 0** 인 것이다(`단계별 종료 코드: 임베딩=0 목적=0 검색목록=0 초안=0`).
초안만 0 이 아니면 배치는 성공으로 끝나고 알림도 없다 — 이 줄을 직접 봐야 안다.
초안 단계 로그에는 `저장: 세부분류 N개 · 성별 N개 포트폴리오` 가 찍힌다(0개여도 정상).

---

## 8. 하지 말 것

- **모델을 억지로 받기** — `KURE-v1`(§3-2)은 선택이다. 디스크·메모리가 빠듯하면 받지 않는다
- **Ollama·qwen 켜기** — 맥미니에서는 돌리지 않는다(§3-3). `SAMAE_PERSONA_COPY=1` 도 넣지 않는다
- **`git pull --force` / `git reset --hard`** — 손으로 고쳐둔 것이 날아간다. `--ff-only` 가 거부하면 보고
- **LaunchAgent 재등록** — 이미 등록돼 있다. 시각을 바꿀 일도 없다
- **검수 상태를 풀어서 시험하기** — 사람이 검수한 목적은 보존 대상이다. 시험하려고 해제하지 말 것
- **DB 마이그레이션 적용** — 필요한 것은 전부 적용돼 있다(§0). 이 문서에는 DB 쓰기가 없다
- **`--apply` 를 임의로 붙이기** — DB 에 쓴다. 이 문서에서 `--apply` 를 쓰는 곳은 없다
  (오전 6시 배치가 알아서 붙인다)
- **돌고 있는 배치 죽이기** — 끝날 때까지 기다린다

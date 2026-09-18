# 38. 맥미니 작업 지시 — 실시간 검색·목적 태그 붙이기 (2026-09-17, 2026-09-18 갱신)

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
| **배치** `com.samae.embed` | 새 사진 임베딩 + 사진 목적 태그 | 매일 06:00 |

필요한 코드는 **PR #356(2026-09-17)·#372(2026-09-18) 로 `main` 에 모두 들어왔다.** 지금 실행해도 된다.

> 🚨 **운영 검색은 이제 맥미니 하나에 달려 있다 (2026-09-18 15:41 배포부터).**
> 전에는 앱이 태그 검색 결과를 함께 보여줘서, 맥미니에 닿지 않아도 화면이 비지 않았다.
> #372 부터 검색 결과는 **SigLIP 으로만** 만든다. 앱이 맥미니에 닿지 못하면(꺼짐·Funnel 끊김·4초 초과·토큰 불일치)
> **모든 검색이 "결과가 없어요" 로 뜬다.** 2026-09-18 배포 직후 운영에서 실제로 그렇게 됐다.
> 그래서 이번에는 **바깥(Funnel) 주소에서 되는지**까지 반드시 확인한다 (§5-3).

**무엇이 새로 생기는가**

- `/search-query` — 검색어에서 **사진 목적을 떼어**(`가을 커플스냅` → 목적 커플 + "가을") 나머지만 벡터로 돌려준다.
  개인 사진을 성별로 찾으면(`여자`, `남자 노을`) 성별도 알려준다 — 앱이 여자/남자 사진을 가른다([docs/29 §12.9](29-siglip-text-search.md))
  형태소 분석기 **Kiwi(`kiwipiepy`)** 가 필요하다. 새 파이썬 패키지라 **`git pull` 만으로는 안 깔린다** (§3-1)
- `/embed-text-backfill` — 배치 전용 임베딩 창구. 사용자 검색보다 **낮은 우선순위**라
  오전 6시 배치가 돌아도 고객 검색이 안 밀린다
- 오전 6시 배치에 **목적 태그 단계**가 붙는다 (사진 임베딩 → 목적 분류 순서)

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
pgrep -fl "embed_photos.py|purpose_backfill.py|run-embed.sh" || echo "돌고 있지 않음"
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
ls scripts/embed/query_parse.py
```

`grep -c` 셋 다 **1 이상**, `query_parse.py` 가 있어야 한다. 아니면 아직 옛 코드다 — `git log` 에 #372 가 있는지 확인할 것.

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

**분리기 자체 점검** (DB·모델 없이 1초):

```bash
cd ~/srv/samae-app/scripts/embed
.venv/bin/python -m unittest test_query_parse -v
cd ~/srv/samae-app
```

**정상** — 전부 `ok`, 마지막 줄 `OK` (2026-09-18 기준 23개).

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

검색어 분리기가 같이 올라왔는지 로그로 본다.

```bash
grep -E "검색어 분리" scripts/embed/logs/serve.log | tail -2
```

**정상** — 마지막 줄에 `⚠️  검색어 분리 꺼짐` 이 **없다.** 있으면 §3-1 설치가 이 venv 에 안 된 것이다.

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
for query in ["가을 커플스냅", "웨딩", "몽환적인 노을", "남자 노을"]:
    req = urllib.request.Request(base + "/search-query", data=json.dumps({"query": query}).encode(),
        headers={"x-samae-token": token, "Content-Type": "application/json"})
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=10) as r:
        d = json.load(r)
    ms = round((time.perf_counter() - started) * 1000)
    print(f"{query} → 목적 {d['purposes']} / 성별 {d.get('gender')} / 글자 '{d['mood_text']}' / 벡터 {len(d['vector']) if d['vector'] else None} / {ms}ms")
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
```

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
4. 상주 서버 /health: (§4 의 출력, "검색어 분리 꺼짐" 이 없었는지)
5. /search-query:     (§5-0 의 네 줄)
6. /embed-text-backfill: (§5-1 의 출력 한 줄)
7. 목적 미리보기:     (§5-2 의 처리 대상 수)
8. 바깥 주소:         (§5-3 의 401 여부와 두 번째 실행 네 줄 — 주소는 빼고)
9. 멈춘 단계가 있으면: 몇 번에서 무엇 때문에
```

그리고 **다음 날 오전 6시 배치가 정상으로 끝났는지**를 한 번 더 확인해야 한다. 이게 실제 확인이다.

```bash
ls -t ~/srv/samae-app/scripts/embed/logs/embed-*.log | head -1 | xargs tail -30
cat ~/srv/samae-app/scripts/embed/logs/purpose-latest/purpose-result.json
```

`purpose-result.json` 에 `updated_photos`(목적이 붙은 사진 수)와 `inherited_photos`(검수 목적을
물려받은 수)가 있다. **둘 다 0 이어도 정상**이다 — 새로 할 일이 없었다는 뜻이다. 중요한 건
**두 단계의 종료 코드가 모두 0** 인 것이다.

---

## 8. 하지 말 것

- **`git pull --force` / `git reset --hard`** — 손으로 고쳐둔 것이 날아간다. `--ff-only` 가 거부하면 보고
- **LaunchAgent 재등록** — 이미 등록돼 있다. 시각을 바꿀 일도 없다
- **검수 상태를 풀어서 시험하기** — 사람이 검수한 목적은 보존 대상이다. 시험하려고 해제하지 말 것
- **DB 마이그레이션 적용** — 필요한 것은 전부 적용돼 있다(§0). 이 문서에는 DB 쓰기가 없다
- **`--apply` 를 임의로 붙이기** — DB 에 쓴다. 이 문서에서 `--apply` 를 쓰는 곳은 없다
  (오전 6시 배치가 알아서 붙인다)
- **돌고 있는 배치 죽이기** — 끝날 때까지 기다린다

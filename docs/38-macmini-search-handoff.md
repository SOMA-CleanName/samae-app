# 38. 맥미니 작업 지시 — 실시간 검색·목적 태그 붙이기 (2026-09-17)

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

지금 맥미니에는 **2026-08 판 코드**가 돌고 있다. 새 기능(실시간 검색용 `/embed-text-backfill`,
목적 태그 자동화)은 `main` 에 없었기 때문이다. **PR #356 이 머지되면** 그 코드가 `main` 에
들어오고, 그때 이 문서대로 맥미니를 갱신한다.

> ⚠️ **PR #356 이 머지되기 전에는 이 문서를 실행하지 말 것.** `git pull` 해도 받을 게 없고,
> 상주 서버만 괜히 내려간다.

**무엇이 새로 생기는가**

- `/embed-text-backfill` — 배치 전용 임베딩 창구. 사용자 검색보다 **낮은 우선순위**라
  오전 6시 배치가 돌아도 고객 검색이 안 밀린다
- 오전 6시 배치에 **목적 태그 단계**가 붙는다 (사진 임베딩 → 목적 분류 순서)

**이미 되어 있는 것 (건드리지 말 것)**

- DB 마이그레이션 `0116`·`0117`·`0118` — 2026-09-15 적용 완료
- DB 마이그레이션 `0121` — 2026-09-17 적용 완료
- launchd 등록 (`com.samae.embed`·`com.samae.serve`) — 2026-08-21 완료. **재등록 불필요**

---

## 1. 지금 상태 먼저 찍기

갱신 **전에** 무엇이 돌고 있었는지 남긴다. 나중에 문제가 생기면 이 출력이 기준이 된다.

```bash
cd ~/srv/samae-app
git log --oneline -1
git branch --show-current
grep -c purpose_backfill scripts/embed/run-embed.sh || true
launchctl list | grep -E 'com\.samae\.(embed|serve)'
curl -s localhost:8077/health
```

**예상** — 브랜치는 `main`, `grep -c` 는 `0`(8월 판이라 목적 단계가 아직 없음),
launchd 두 항목이 보이고, `/health` 가 `{"ok": true, "device": "mps", ...}` 를 준다.

**멈출 때**
- 브랜치가 `main` 이 아니면 → 멈추고 보고. 다른 작업 중일 수 있다
- `/health` 가 응답이 없으면 → 상주 서버가 죽은 것이다. 그것부터 보고 (§6)

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
```

둘 다 **1 이상**이어야 한다. `0` 이면 아직 옛 코드다 — PR 머지 여부를 다시 확인할 것.

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

**멈출 때**
- `device` 가 `mps` 가 아니면 → 멈추고 보고. CPU 로 떨어지면 몇 배 느려진다
- 1분이 지나도 `/health` 가 안 뜨면 → 멈추고 로그를 보고 (§6)

---

## 5. 두 엔드포인트 점검

### 5-1. 검색용 `/embed-text`

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

---

## 7. 끝나고 남길 것

아래를 그대로 회신하면 된다. **토큰·벡터·사진 URL 은 빼고.**

```
1. 갱신 전 커밋:      (§1 의 git log 첫 줄)
2. 갱신 후 커밋:      (§3 의 git log 첫 줄)
3. 상주 서버 /health: (§4 의 출력)
4. 엔드포인트 점검:   (§5-1 의 출력 한 줄)
5. 목적 미리보기:     (§5-2 의 처리 대상 수)
6. 멈춘 단계가 있으면: 몇 번에서 무엇 때문에
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
- **`--apply` 를 임의로 붙이기** — DB 에 쓴다. 이 문서에서 `--apply` 를 쓰는 곳은 없다
  (오전 6시 배치가 알아서 붙인다)
- **돌고 있는 배치 죽이기** — 끝날 때까지 기다린다

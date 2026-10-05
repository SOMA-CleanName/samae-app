# 48. 맥미니 작업 지시 — 무드 검색(KURE 가족 찾기) 올리기 · 신규 사진 무드 태그 운영 (2026-10-05)

> **읽는 사람에게.** 이 문서는 맥미니에서 명령을 실행하는 사람(또는 에이전트)을 위한 것이다.
> 위에서부터 순서대로 하면 된다. **각 단계마다 "이러면 정상 / 이러면 멈춘다" 를 적어뒀다.**
> 판정 기준에 안 맞으면 다음 단계로 넘어가지 말고 그 자리에서 멈추고 보고할 것.
>
> 무엇을 왜 바꿨는지는 [docs/47 §9 ~ §12](47-photo-mood-tags.md) 에 있다. 이 문서는 **실행 순서**와 **그 뒤의 운영**만 다룬다.
> 맥미니 일반(launchd · Funnel · 토큰)은 [docs/28](28-embedding-batch-automation.md) · [docs/38](38-macmini-search-handoff.md) 을 따른다.

---

## 0. 먼저 알아야 할 것

**무엇이 새로 생기는가** — 상주 서버(`com.samae.serve`, 8077)의 `/search-query` 응답에 두 칸이 붙는다.

| 칸 | 내용 |
|---|---|
| `mood_families` | 검색어의 무드 글자와 가장 가까운 **사진 뼈대 검색어**가 든 가족 `[{key, name, score, term}]` |
| `family_scores` | 모든 가족(97)의 가까움 `{f01: 0.62, …}` — 앱이 연관 무드(비슷한 큰 무드 · 가족)를 고른다 |

- 가까움은 **KURE-v1**(한국어 임베딩)로 잰다. 서버가 켜질 때 뼈대 검색어 912개를 한 번 임베딩해 `scripts/embed/cache/kure-mood-terms.npz` 에 담아 둔다(git 에 안 올라가는 캐시, 다음부터는 바로 읽는다)
- 앱은 `mood_families` 가 오면 그 가족에 **확정된 사진**(커밋된 `src/lib/mood-family-photos.json`)을 보여준다. 정확한 검색은 가족, 애매한 검색은 큰 무드 전체
- **KURE 가 이제 선택이 아니다.** docs/38 §3-2 에서는 "안 받아도 된다" 였지만, 무드 검색이 KURE 에 기댄다.
  KURE 가 없으면 서버는 그대로 뜨고 `mood_families` 만 빈 배열이 된다 → 앱은 **예전 무드 검색(태그 + SigLIP)** 으로 돈다(검색이 비지는 않는다)

**순서가 중요하다 — 앱 배포와 맥미니 갱신 중 어느 쪽이 먼저여도 깨지지 않는다.**

| | 앱 옛 판 | 앱 새 판(PR #416) |
|---|---|---|
| **맥미니 옛 판** | 지금 그대로 | `mood_families` 가 없으니 예전 무드 검색 — 정상 |
| **맥미니 새 판** | 새 칸을 모르고 무시 — 정상 | 무드 검색 |

**하지 않는 것** — DB 쓰기 · 마이그레이션 없음. launchd 재등록 없음(재시작만).

---

## 1. 지금 상태 먼저 찍기

```bash
cd ~/srv/samae-app
git log --oneline -1
git branch --show-current
grep -c family_match scripts/embed/serve.py || true
launchctl list | grep -E 'com\.samae\.(embed|serve)'
curl -s localhost:8077/health
tailscale funnel status
ls ~/.cache/huggingface/hub | grep -i kure || echo "KURE 없음"
```

**정상** — 브랜치 `main`, launchd 두 항목, `/health` 가 `{"ok": true, "device": "mps", …, "purpose_nearest": …}`.
`grep -c family_match` 는 0 이면 옛 판, 1 이상이면 이미 새 판이다. `KURE 없음` 이면 §4 에서 받는다.

**멈출 때** — docs/38 §1 과 같다(브랜치가 main 이 아님 · `/health` 무응답 · Funnel 에 8077 없음).

---

## 2. 배치가 돌고 있지 않은지 확인

```bash
pgrep -fl "embed_photos.py|purpose_backfill.py|run-embed.sh" || echo "돌고 있지 않음"
```

**정상** — "돌고 있지 않음". **멈출 때** — 돌고 있으면 끝날 때까지 기다린다(죽이지 말 것).

---

## 3. 코드 갱신

**PR #416 이 `main` 에 들어간 뒤에** 한다.

```bash
cd ~/srv/samae-app
git status --short --branch
git pull --ff-only
grep -c 'family_match' scripts/embed/serve.py
ls scripts/embed/mood_family_match.py scripts/embed/mood-edits/photo-mood-layers-v1.json
```

**정상** — `git status` 깨끗 · fast-forward · `grep -c` 1 이상 · 두 파일이 있다.

**멈출 때** — docs/38 §3 과 같다(수정된 파일이 있음 · fast-forward 거부). `grep -c` 가 0 이면 #416 이 아직 안 들어왔다.

새 파이썬 패키지는 없다(`numpy` · `torch` · `transformers` 는 이미 있다).

---

## 4. KURE-v1 확인 (없으면 받는다)

```bash
cd ~/srv/samae-app
scripts/embed/.venv/bin/python - <<'PY'
import sys
sys.path.insert(0, "scripts/embed")
from purpose_nearest import kure_encoder
enc = kure_encoder(local_only=True)
print("KURE 있음 — 차원", enc(["비 오는 날"]).shape[1])
PY
```

**정상** — `KURE 있음 — 차원 1024`.

**`OSError` 가 나면(받아 둔 게 없다)** — 한 번 받는다. 약 2.2GB, 몇 분. 메모리는 SigLIP 과 합쳐 약 2.6GB(docs/38 §3-2 실측).

```bash
scripts/embed/.venv/bin/python -c "from huggingface_hub import snapshot_download; print('받음:', snapshot_download('nlpai-lab/KURE-v1'))"
```

받은 뒤 위 확인을 다시 돌려 `차원 1024` 를 본다.

**멈출 때** — 디스크가 모자라거나 받기가 실패하면 멈추고 보고. **받지 않고 §5 로 가도 검색은 예전 방식으로 돈다** — 억지로 고치지 말 것.

---

## 5. 상주 서버 재시작

```bash
cd ~/srv/samae-app
launchctl kickstart -k "gui/$(id -u)/com.samae.serve"
sleep 25
grep -E "✅|⚠️|🚀" scripts/embed/logs/serve.log | tail -8
```

**정상** — 끝 몇 줄에 아래가 차례로 보인다(숫자는 다를 수 있다).

```
✅ 모델 준비 …s (device=mps, budget=256)
✅ 검색어 분리 준비 …s
✅ 목적 가까움 비교 준비 …s (예시 159개)
✅ 무드 가족 찾기 준비 …s (검색어 912개)
🚀 임베딩 서비스 http://127.0.0.1:8077
```

첫 재시작은 `무드 가족 찾기 준비` 가 몇 초 걸린다(검색어 912개를 KURE 로 처음 임베딩해 캐시에 담는다). 다음부터는 0.0s.

**멈출 때**
- `⚠️  목적 가까움 비교 꺼짐 — KURE-v1 없음` → §4 를 안 했다. 검색은 예전 방식으로 돈다 — 보고하고 §4 로
- `⚠️  무드 가족 찾기 꺼짐 (…)` → 층 파일(`photo-mood-layers-v1.json`)을 못 읽었다. 메시지를 그대로 보고
- `🚀` 가 안 뜬다 → 서버가 안 떴다. **운영 검색이 전부 비어 있을 수 있다.** 바로 보고(docs/38 §6)

---

## 6. 점검

### 6-1. 맥미니 안에서

토큰은 `.env.local` 에서 읽고 **토큰 · 벡터 값은 출력하지 않는다.**

```bash
cd ~/srv/samae-app
check_mood() {
  scripts/embed/.venv/bin/python - "$1" <<'PY'
import json, sys, time, urllib.request
sys.path.insert(0, "scripts/embed")
from check_db import load_env
base = sys.argv[1].rstrip("/")
token = load_env(".env.local").get("PERSONA_SERVICE_TOKEN", "")
for query in ["비 오는 날", "가을 감성", "고즈넉한", "몽환 커플 스냅", "웨딩"]:
    req = urllib.request.Request(base + "/search-query", data=json.dumps({"query": query}).encode(),
        headers={"x-samae-token": token, "Content-Type": "application/json"})
    t = time.perf_counter()
    with urllib.request.urlopen(req, timeout=10) as r:
        d = json.load(r)
    fams = ", ".join(f"{f['name']} {f['score']:.2f}" for f in d.get("mood_families", []))
    print(f"{query} → 목적 {d['purposes']} / 글자 '{d['mood_text']}' / 가족 [{fams}] / 점수표 {len(d.get('family_scores', {}))} / {round((time.perf_counter() - t) * 1000)}ms")
PY
}
check_mood http://127.0.0.1:8077
```

**정상**

```
비 오는 날 → 목적 [] / 글자 '비 오는 날' / 가족 [비 오는 날 1.00] / 점수표 97 / …ms
가을 감성 → 목적 [] / 글자 '가을 감성' / 가족 [감성 1.00, 가을 스냅 1.00] / 점수표 97 / …ms
고즈넉한 → 목적 [] / 글자 '고즈넉한' / 가족 [아늑한 0.78, 분위기 있는 0.78, 편안한 0.77] / 점수표 97 / …ms
몽환 커플 스냅 → 목적 ['couple'] / 글자 '몽환' / 가족 [몽환 1.00] / 점수표 97 / …ms
웨딩 → 목적 ['wedding'] / 글자 '' / 가족 [] / 점수표 0 / …ms
```

- 가족 이름은 층 파일의 이름이다(사람이 고친 이름과 다를 수 있다 — 앱은 자기 색인의 이름을 쓴다)
- 목적만 검색(`웨딩`)은 가족이 비는 게 정상
- 응답 시간은 예전보다 수십 ms 늘 수 있다(KURE 한 번). 첫 요청은 조금 더 걸린다(맥북 실측 2026-10-05: 첫 170ms, 그 뒤 30~40ms). **500ms 를 넘으면** 보고

**멈출 때** — 가족이 전부 `[]` 이고 점수표가 0 → 무드 가족 찾기가 꺼져 있다(§5 로그 확인).

### 6-2. 바깥(Funnel) 주소에서

운영 앱은 바깥 주소로 들어온다. **반드시 확인한다**(docs/38 §0 — 맥미니에 못 닿으면 검색이 전부 빈다).

`tailscale funnel status` 에 나온 `https://…ts.net` 주소를 넣는다(끝에 경로를 붙이지 않는다, docs/38 §5-3 과 같다).

```bash
FUNNEL=https://YOUR-MACMINI.YOUR-TAILNET.ts.net   # funnel status 의 실제 주소로 바꾼다
check_mood "$FUNNEL"
```

**정상** — 6-1 과 같은 줄이 나온다.

### 6-3. 운영 화면

PR #416 이 배포된 뒤 사매 홈에서 `비 오는 날` · `고즈넉한` · `커플 스냅` 을 검색한다.
결과 머리줄 아래 **연관 무드** 줄이 뜨면 정상이다(`커플 스냅` → 설렘 · 달달한 · 로맨스 …).

---

## 7. 그 뒤의 운영 — 무엇이 자동이고 무엇이 손인가

| 일 | 어디서 | 언제 | 자동? |
|---|---|---|---|
| 새 사진 임베딩 · 목적 태그 | 맥미니 `com.samae.embed` | 매일 06:00 | **자동**(그대로) |
| 검색어 → 가족(KURE) | 맥미니 상주 서버 | 검색마다 | **자동** |
| 새 사진 **무드 태그** 매기기 · 검수 | 어드민 › 사진 목적&무드 › 사진 태그 › **신규 사진** | 새 사진이 쌓였을 때 | **손** — [새 사진 불러오기] → 빼기 → [확정] |
| 검색 색인(`mood-family-photos.json`) | 어드민이 검수 · 이름을 저장할 때마다 다시 씀 | 저장 즉시 | 자동(로컬 파일) — **운영 반영은 커밋 · 배포** |
| 같은 사진 표(`duplicate-photos.json`) | `py find_duplicate_photos.py` | 새 사진이 쌓였을 때 | 손 — 커밋 · 배포 |
| 가족 문장을 고쳤을 때 전체 다시 | `tag_photo_moods.py` → `export_family_model.py` | 문장을 고쳤을 때 | 손 |

### 7-1. 왜 무드 태그는 맥미니 배치에 넣지 않았나

- 신규 사진 무드 태그는 **사람이 확정해야** 검색에 들어간다(빼기 검수). 배치가 매겨 둬도 결국 어드민에서 사람이 봐야 한다
- 그래서 매기기를 어드민 버튼으로 뒀다 — 맥미니 06:00 배치가 임베딩만 만들어 두면, 어드민 [새 사진 불러오기] 가 DB 에서 벡터를 읽어 굳힌 기준(`photo-family-model.json`)으로 바로 매긴다(8077 도 qwen 도 필요 없다)
- 검색 색인 · 같은 사진 표는 **커밋된 파일**이다(사진 태그를 아직 DB 에 쓰지 않기로 했다, docs/47 §7). 운영에 반영하려면 검수한 쪽에서 커밋 · PR · 배포한다.
  맥미니에서는 커밋하지 않는다(맥미니는 `main` 을 받기만 한다)

### 7-2. 새 사진 운영 순서(어드민 쪽, 맥미니 아님)

1. 06:00 배치가 끝난 뒤 로컬 어드민 › 사진 태그 › **신규 사진** → **[새 사진 불러오기]** (한 번에 300장)
2. 사진마다 틀린 가족만 [빼기] → **[확정]**. 태그가 하나도 안 맞으면 [태그 없이 확정]
3. `py find_duplicate_photos.py` — 같은 파일을 여러 앨범에 올린 사진이 생겼는지
4. `src/lib/mood-family-photos.json` · `src/lib/duplicate-photos.json` · `scripts/embed/mood-edits/` 를 커밋 → PR → 배포

### 7-3. 가족 문장을 고쳤을 때

문장을 고치면 기준(문장 지문)이 달라져 **신규 사진 매기기가 멈춘다**(화면에 경고). 전체를 다시 돌린다:

```bash
py scripts/embed/tag_photo_moods.py        # 전체 다시(8077 필요) — 바뀐 가족만 다시 검수
py scripts/embed/export_family_model.py    # 새 기준 굳히기(검산: 기존 태그 z 차이 0.005 이하)
```

그 뒤 신규 사진은 새 기준으로 다시 매긴다(예전 신규 매김은 지문이 달라 저절로 빠진다).

---

## 8. 되돌리기 · 안 될 때

| 증상 | 할 일 |
|---|---|
| 무드 검색 결과가 이상하다 · 응답이 느리다 | 맥미니 `.env.local` 에 `SAMAE_PURPOSE_NEAREST=0` 을 넣고 §5 재시작 → KURE 가 꺼져 `mood_families` 가 빈다 → 앱이 예전 무드 검색으로 돈다(목적 가까움 비교도 함께 꺼진다). 보고 |
| `/search-query` 500 | `serve.log` 끝을 그대로 보고. 서버 코드를 고치지 말 것 |
| 운영 검색이 전부 빈다 | 무드 검색과 무관하게 맥미니에 못 닿는 것이다 — docs/38 §6 |

## 9. 하지 말 것

- 맥미니에서 커밋 · 푸시 · 파일 손질(`mood-edits/` 포함) — 받기만 한다
- 맥미니에서 qwen(Ollama) 돌리기 — 무드 검색은 qwen 을 쓰지 않는다
- `cache/kure-mood-terms.npz` 를 지우는 것 외의 캐시 손질 — 지우면 다음 재시작에 다시 만든다(몇 초)

## 10. 끝나고 남길 것

§1 출력 · §5 로그 끝 8줄 · §6-1 · §6-2 출력을 그대로 붙여 보고한다.

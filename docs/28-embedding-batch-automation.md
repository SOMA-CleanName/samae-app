# 28. 임베딩 배치 자동화 (2026-08-19)

> 문서 상태: **구현 완료 · 맥미니 설치 대기.** 스크립트와 launchd 정의는 저장소에 있고, 맥미니에서 설치 스크립트를 한 번 실행하면 동작한다.
>
> 선행 문서: [22 시각 유사도 추천](22-visual-similarity.md) §7.4 — 이 작업이 그 문서의 **6단계**다.

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
        ├─ venv 파이썬으로 embed_photos.py --apply
        ├─ 로그 기록 (최근 14개 유지)
        └─ 실패 시 디스코드 알림
```

| 파일 | 역할 |
|---|---|
| `scripts/embed/macmini-setup.sh` | Python·venv·패키지·모델 캐시·launchd 등록. **재실행 안전** |
| `scripts/embed/run-embed.sh` | 배치 실행 래퍼. 로그·락·실패 알림 |
| `scripts/embed/com.samae.embed.plist.template` | launchd 정의. `__REPO__` 를 설치 시 실제 경로로 치환 |

plist 를 템플릿으로 둔 이유는 **저장소 경로가 기계마다 다르기 때문이다.** 경로를 박아 커밋하면 그 기계에서만 동작한다. 설치 스크립트가 자기 위치에서 저장소 루트를 계산해 렌더한다.

실행 시각은 **06:00** 이다. 사용자 트래픽이 가장 적고, 오전 업무 시작 전에 전날 업로드분이 반영된다.

---

## 4. 설치 (맥미니에서 한 번)

```bash
git clone https://github.com/SOMA-CleanName/samae-app.git
cd samae-app && git checkout dev

# .env.local 을 옮겨 넣는다 (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요)

bash scripts/embed/macmini-setup.sh
sudo pmset -a sleep 0 disksleep 0      # 안내에 따라 직접 실행
```

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
| — | 맥미니 설치 | 대기 |

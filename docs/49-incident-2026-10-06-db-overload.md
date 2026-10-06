# 49 · 2026-10-06 장애 — 사이트 응답없음 3시간 10분 (DB 과부하)

> 문서 상태: **조치 완료, 사후 확인 대기** (작성 2026-10-06)
> 관련 PR: #421 · #422 · #423 · #425 · #426 · #429
> 이 문서의 목적: 같은 증상이 다시 나면 **어디를 보고, 무엇을 끄고, 무엇을 되돌리는지** 바로 찾게 한다.

---

## 1. 요약

- **무슨 일**: 2026-10-06 09:20 ~ 12:30 (KST) `www.samae.ai` 가 **응답없음**(무한 로딩). 트래픽 최고점이었고, 정훈이 우연히 접속해 보기 전까지 아무도 몰랐다.
- **원인**: 홈 피드 · 매거진의 **촬영 장소 카드**가 장소별 사진을 `location_text ilike '%키워드%'` 로 찾았다. 인덱스를 못 타서 매번 `photos` 를 통째로 훑는 쿼리를 **공개 장소 수만큼(약 18개) 동시에, Vercel 인스턴스마다, 1분마다** 했다. 아침 트래픽이 평소의 10~15배로 몰려 인스턴스가 늘자 이 쿼리도 같이 불어났고, 작은 DB 의 CPU 가 바닥났다. 이 쿼리 하나가 **DB 시간의 77%** 였다.
- **복구**: 12:30 팀원이 Supabase 컴퓨트를 늘렸다(증설 시 DB 재시작 동반).
- **재발 방지**: 장소 카드를 DB 쿼리 0개 구조로 바꾸고(#423 · #425), 같은 패턴(인스턴스별 1분 메모로 무거운 조회 반복)의 다른 곳도 고쳤다(#423 · #426 · #429). 사이트 감시를 붙였다(#421).

---

## 2. 타임라인 (KST)

| 시각 | 일 | 근거 |
|---|---|---|
| 10/6 06:23 | 장애 전 마지막 배포(#420). 이후 13:05 까지 `main` 머지 없음 → **배포가 원인 아님** | `git log origin/main --first-parent` |
| 07:00 ~ 09:00 | 트래픽 급증. API Gateway 시간당 요청이 평소의 10~15배, 2시간 **132,051건** | Supabase API Gateway |
| 08시대 | 응답 에러 시작 — `feed_photos_seeded` 500(96) · 504(44), `search_logs` 404(159) | API Gateway Response Errors |
| **09:04** | 첫 경고 `IncreaseSubscriptionConnectionPool: Too many database timeouts` | Logs(realtime) |
| **09:20** | 사이트 응답없음 시작 | #421 스크립트 주석 · 팀 보고 |
| 09:27 ~ 12:25 | `canceling statement due to statement timeout`(57014) 반복. 가벼운 시스템 쿼리(`CheckOids`)까지 타임아웃 | Logs(postgres · realtime) |
| 09:32 → 09:34 | `Database pool connection lost` → `reconnected` | Logs(realtime) |
| 09:52 | `connection not available … dropped from queue after 11999ms` — 커넥션 고갈 | Logs(realtime) |
| 09:58 | DB 송신량 정점 1 MB/s | Observability → Database(Network) |
| 12:25 | `pgbouncer.get_auth` 한 번에 15.5초(새 커넥션 인증조차 못 함) | Logs(postgres) |
| **12:30** | 팀원이 **Supabase 컴퓨트 증설** → 복구 | 팀 보고 |
| 13:05 | **#421** 맥미니 5분 감시 → 디스코드 | PR |
| 15:34 | **#422** 장소 카드 임시 끄기 | PR |
| 17:28 | **#423** 장소 카드 · 검색 스냅샷 · 방문 기록 집계 | PR |
| 18:13 | `spot_photos` 전체 계산(백필) 실행 | 어드민 「전체 다시 계산」 |
| 18:57 | **#425** 장소 ↔ 사진 연결 저장 | PR |
| 18:59 | **#426** 홈 피드 순서를 앱에서 섞기 | PR |
| 19:09 | **#429** 방문 기록 비콘 세션 갱신 제외 | PR |

---

## 3. 증상과 증거 — 어디서 무엇을 봤나

### 3.1 사이트 쪽
- 에러 페이지가 아니라 **응답없음**(무한 로딩). 서버가 DB 대답을 기다리다 멈춘 모양이다.
  요금 한도로 막힌 경우(즉시 안내/에러 페이지)나 코드 오류(즉시 500)와 구별되는 지점이다.

### 3.2 Supabase Query Performance (누적 통계, 10/6 오후 기준)
| 순위 | 쿼리 | DB 시간 | 호출 | 평균 | 정체 |
|---|---|---|---|---|---|
| 1 | `photos` 조회 (anon) | **55.6%** | 282,592 | 344ms | 장소 카드 `fetchMatched` |
| 2 | 같은 쿼리 (다른 통계 항목) | **21.6%** | 108,689 | 348ms | 〃 |
| 3 | Realtime WAL 변경 감지 | 7.0% | 199만 | 6ms | 채팅·알림 실시간 |
| 4 | `analytics_events` 조회 (service_role) | 6.0% | 22,417 | 472ms | 인기 집계(무드 그리드 · TREND) |
| 5 | RPC (anon) | 2.5% | 53,713 | 81ms | 홈 피드 `feed_photos_seeded` 추정 |
| 12 | `explore_category_photos` | 0.4% | **291,826** | 2ms | 취향 헤드, 페이지마다 조회 |
| 13 | `pgbouncer.get_auth` | 0.3% | 129,697 | 5ms (최대 20s) | 커넥션 인증 |

- 1·2위 쿼리 전문에 `location_text ilike $4` 와 `src/lib/spots.ts` 의 `GALLERY_SELECT` 가 그대로 찍혀 있었다 → 출처 확정
- Cache hit 100% + 평균 344ms → 디스크가 아니라 **CPU** 를 먹는 쿼리

### 3.3 그 밖에
- **API Gateway 07~09시 요청 상위**: `analytics_events` 저장 3,642 · `/auth/v1/user` 2,960 · `articles` 2,399 · `home_banners` 2,314 · `feed_photos_seeded` 2,208 → 홈 방문 약 2,300번
- **Observability Overview**: Database 에러율 52.9%, 최대 커넥션 44/60, 느린 쿼리 470건, 메모리 72%
  (최대 커넥션 60 → 장애 당시 컴퓨트는 Micro 로 **추정**)

---

## 4. 원인

### 4.1 근본 원인 — 촬영 장소 카드의 매칭 구조
```
홈 피드(/, /c/[slug]) · 매거진(/explore)
  └ memoTtl("explore:spots", 1분)        ← 인스턴스마다 따로
      └ listSpotCards
          └ 공개 장소 전부(약 18곳) 동시에 fetchMatched
              └ photos ... where location_text ilike '%키워드%'   ← 인덱스 못 탐, 전체 훑기
```
- 홈 카드는 **3장**, 매거진 레일은 **5장**만 보여 주는데, 고르려고 매번 전부 계산했다
- 캐시가 인스턴스 메모리라 트래픽이 몰려 Vercel 이 인스턴스를 늘리면 **새 인스턴스마다 18개를 또** 날렸다
- 쿼리가 느려지면 응답이 밀리고 → 인스턴스가 더 늘고 → 쿼리가 더 늘는 **악순환**
- 9/1 홈 재구성(`d8e04dc`)부터 있던 구조. 평소 트래픽에선 버텼고 10/6 아침 10~15배에서 무너졌다

### 4.2 기여 요인 — 같은 패턴의 다른 곳
| 곳 | 문제 | 비중 |
|---|---|---|
| 인기 집계(홈 무드 그리드 · 매거진 TREND) | 페이지뷰 원본 행(최대 10만 요청)을 앱으로 받아 JS 로 셈, 인스턴스마다 1분마다 | 6% |
| 홈 피드 `feed_photos_seeded` | 48장마다 공개 사진 전부에 md5 를 매겨 정렬, 시드가 방문자마다 달라 재사용 불가 | 2.5% |
| 취향 헤드 `categoryMemberIds` | 페이지마다 카테고리 사진 · 숨긴 사진 목록 조회 | `explore_category_photos` 29만 회(대부분 이것으로 추정) |
| proxy 세션 갱신 | 로그인 사용자의 방문 기록 비콘마다 Auth 서버 호출 | `/auth/v1/user` 하루 1위 |
| 컴퓨트 | Micro 추정(커넥션 60) | — |

### 4.3 왜 3시간 동안 아무도 몰랐나
- 사이트 감시가 없었다 → **#421** 맥미니에서 5분마다 확인, 2회 연속 실패 시 디스코드

### 4.4 검토하고 배제한 가설
| 가설 | 배제 근거 |
|---|---|
| 요금 · 사용량 한도 초과 | 한도로 막히면 즉시 차단/안내가 뜬다. 로그는 DB 가 돌면서 타임아웃을 냈다 |
| 잘못된 배포 | 06:23 ~ 13:05 사이 `main` 머지 없음 |
| Vercel · Supabase 플랫폼 장애 | 두 상태 페이지에 10/5~6 장애 기록 없음 |
| 페르소나 이벤트 쿼리 | service_role `photos` 조회 0.3%, 기본키 조회뿐. **유입의 원인**이었을 수는 있다 |
| 09:00 크론(`/api/cron/daily`) | 알림 · 상태 정리 위주로 가볍다 |
| 검색 | 태그는 GIN, 벡터는 HNSW 인덱스. 무거운 z 컷 함수는 꺼져 있었다 |

---

## 5. 조치 — PR 별

| PR | 무엇을 | 주요 파일 | 되돌리는 법 |
|---|---|---|---|
| **#421** | 맥미니 5분 감시 → 디스코드 | `scripts/uptime-watch.sh`, `scripts/com.jazz.samae-uptime.plist` | launchd 해제 |
| **#422** | 장소 카드 임시 끄기 | `src/lib/feed-interstitials.ts`, `src/app/(user)/explore/page.tsx` | (#423 에서 다시 켬) |
| **#423** | ① 장소 카드를 06:00 사진 목록(스냅샷)에서 메모리로 매칭 ② 검색도 스냅샷 우선, **낡아도 버리지 않음** ③ 스냅샷 26시간 지연 알림 ④ 인기 조회수를 DB 함수로 집계(**0144**) | `src/lib/spots.ts`, `spot-match.ts`, `discovery.ts`, `snapshot-watch.ts`, `explore-db.ts`, `supabase/migrations/0144_pageview_counts.sql` | 장소: 스위치 `false` / 집계: 함수 drop 하면 예전 방식으로 돌아감 |
| **#425** | ① 장소 ↔ 사진 연결 표 `spot_photos`(**0145**) ② 어드민 촬영 장소 → [장소별 사진] 탭 ③ 06:00 맥미니 배치 `[5/5]` 신규 연결 + 09:00 백업 ④ `photos.region` 채우기 | `src/lib/spot-photos.ts`, `spot-photo-sync.ts`, `photo-region.ts`, `src/app/(admin)/admin/spots/photos/*`, `src/app/api/cron/spot-photos/route.ts`, `scripts/embed/run-embed.sh` | 표 drop 하면 스냅샷 매칭으로 돌아감 |
| **#426** | 홈 피드 순서를 앱에서 섞기(id 목록 1분 메모 + 기본키 48장), 취향 헤드 1분 메모 | `src/lib/discovery.ts` (`fetchSeededFeedAt`, `categoryMemberIds`) | `feed_photos_seeded` 함수는 DB 에 남아 있다 — `fetchSeededFeedAt` 를 RPC 호출로 되돌리면 된다 |
| **#429** | `/api/track` 을 proxy 세션 갱신에서 제외 | `src/proxy.ts` (matcher) | matcher 에서 `api/track(?:/|$)` 삭제 |

### 결과 (조치 후 구조)
| 곳 | 전 | 후 |
|---|---|---|
| 장소 카드 | 인스턴스마다 1분에 무거운 쿼리 약 18개 | 저장된 연결(`spot_photos`)을 기본키 조인 1번 (1분 메모) |
| 인기 집계 | 원본 행 수천~수만 전송, 1분마다 | DB 함수가 세고 숫자표 1행 (1분 메모) |
| 홈 피드 | 페이지마다 전체 md5 정렬 | 1분에 id 목록 1번 + 페이지당 기본키 48장 |
| 취향 헤드 | 페이지마다 조회 | 1분 메모 |
| 방문 기록 비콘 | 로그인 사용자마다 Auth 호출 | 호출 없음 |
| 검색 태그 일치 | 홈 검색은 **검색마다** 1,600장 직접 읽기, 무드 검색은 스냅샷(이틀 넘으면 직접) | 둘 다 스냅샷, 낡아도 계속 사용 |

---

## 6. 같이 발견해 고친 버그

| 버그 | 영향 | 고친 곳 |
|---|---|---|
| **스냅샷(`search_tag_snapshot`)이 조용히 낡아 있었다** — 을지로 DB 66장 · 스냅샷 50장 | 무드 검색 결과가 그 시점에 굳음. 이틀 넘으면 검색마다 DB 전체 읽기로 떨어졌을 수 있음 | 10/6 손으로 재생성(사진 1,074장) + #423 26시간 알림 |
| 서버가 막 뜬 직후 동시 요청이 스냅샷을 받는 중인데도 **빈손(null)으로 돌아감** | 장소 카드가 빈 채 1분 캐시, 검색은 DB 직접 읽기 | #423 `ensureSnapshot` |
| 홈(`listSpotCards(6)`)과 매거진(`listSpotCards(50)`)이 **같은 캐시 키** `explore:spots` | 먼저 채운 쪽 개수가 다른 쪽에 나감 | #423 홈은 `home:spots` |
| 인기 집계가 **API 최대 행 수(1,000)에 잘려** 30일 사진 조회 1,512건 중 1,000건만 셈 | TREND 순위가 실제와 달랐다(29→42, 25→36) | #423 0144 |

---

## 7. 코드 밖에서 운영에 직접 반영한 것

> 코드 · git 에 안 남는 것들. 역추적할 때 여기부터 본다.

| 무엇 | 언제 | 누가 · 어떻게 |
|---|---|---|
| Supabase 컴퓨트 증설 | 10/6 12:30 | 팀원, 대시보드. **증설 후 크기는 확인 필요** (Project Settings → Compute and Disk) |
| `0144_pageview_counts.sql` 운영 적용 | 10/6 오후 | SQL Editor |
| `search_tag_snapshot` 손으로 재생성 | 10/6 오후 | `python3 scripts/embed/build_search_tags.py --apply` — 사진 1,074장 · 앨범 140 · 작가 13 · 808KB |
| `0145_spot_photos.sql` 운영 적용 | 10/6 저녁 | SQL Editor |
| `spot_photos` 전체 계산(백필) | 10/6 18:13 | 어드민 「전체 다시 계산」. 이후 공개 여부 상관없이 연결하도록 바꾼 뒤 한 번 더 |

---

## 8. 지금 구조 — 장소 · 검색 데이터 흐름

```
[맥미니 06:00 run-embed.sh]                                  docs/28
  [1/5] 사진 임베딩 → [2/5] 목적 태그 → [3/5] build_search_tags.py → search_tag_snapshot (한 줄)
  [4/5] 세부분류·성별 초안
  [5/5] curl /api/cron/spot-photos (CRON_SECRET)  → spot_photos 신규 연결(최근 이틀) + photos.region
[Vercel 09:00 /api/cron/daily]
  · snapshot-freshness  — 스냅샷이 26시간 넘게 그대로면 디스코드
  · spot-photos-backup  — 06:00 백업(이미 연결된 건 건너뜀)
[어드민 촬영 장소 → 장소별 사진]
  · 전체 다시 계산(수동 전체 백필) · 빼기/되살리기 · 직접 넣기 · 나열형 지면에 싣기

[읽는 쪽]
  홈 · 매거진 장소 카드, /spots, 상세, 사이트맵 → spot_photos (없으면 스냅샷 → 그것도 없으면 /spots 만 DB)
  무드 검색 · 홈 검색 태그 일치                 → search_tag_snapshot (한 번도 못 받았을 때만 DB)
  매거진 TREND · 홈 무드 그리드 조회수          → explore_view_counts · photo_view_counts (0144)
```

**운영 결정 (10/6)**
- 스냅샷이 갱신 안 돼도 **기존 스냅샷을 계속 쓴다**(검색 · 장소 모두). 낡은 건 화면이 아니라 알림으로 잡는다
- 숨긴 사진이 다음 스냅샷까지 검색에 남는 건 받아들인다(9/21 결정의 연장)
- 장소 연결은 **사진 공개 여부와 상관없이** 저장하고, 안 보이는 사진은 지면에서 읽을 때 거른다
- 나열형 메모(「경복궁, 창덕궁, 창경궁, 덕수궁」)는 네 장소 모두에 저장, 지면엔 자동으로 안 띄움
- 「서울」 처럼 넓은 말은 `photos.region` 에 저장
- 06:00 은 **신규 사진만**. 나중에 장소 메모를 단 사진 같은 예외는 「전체 다시 계산」 버튼으로
- 인기 조회수 캐시는 1분 (조회수가 바로 오르는 게 보이게)

---

## 9. 다시 문제가 생기면 — 역추적 가이드

### 9.1 먼저 볼 곳
1. **디스코드 경보**: `🔴 사매 응답 없음`(#421) · `⚠️ 공개 사진 목록이 N시간째 그대로`(#423)
2. **Supabase → Observability → Query Performance**: Total time 순. 상위 쿼리를 펼쳐 SQL 을 코드와 맞춘다
3. **Supabase → Logs**: `postgres` 에서 `57014 statement timeout` · `too many clients`, `realtime` 에서 `DatabaseConnectionDown`
4. **Supabase → API Gateway**: 시간 범위를 장애 직전으로 좁혀 요청 상위 · 에러 상위

### 9.2 증상별
| 증상 | 의심 | 바로 할 수 있는 것 |
|---|---|---|
| 사이트 응답없음 + DB 타임아웃 | 새로 생긴 무거운 쿼리 | Query Performance 1위 확인. 인스턴스별 메모로 무거운 조회를 반복하는 패턴(§4.2)인지 본다 |
| 장소 카드 · 장소 지면 이상 | `spot_photos` · 스냅샷 | 스위치 `SPOT_CARDS_ENABLED`(`lib/feed-interstitials.ts`) · `SPOTS_RAIL_ENABLED`(`(user)/explore/page.tsx`)를 `false` 로. 어드민 장소별 사진 탭에서 연결 확인 |
| 장소 수 · 장수가 DB 와 다름 | 연결 계산 안 돎 | 어드민 「전체 다시 계산」. 맥미니 로그 `[5/5]` 응답 코드(401 = `CRON_SECRET`) |
| 검색 결과가 오래된 듯 | 스냅샷 멈춤 | `select built_at from search_tag_snapshot;` → 손으로 재생성(docs/28 §5.1) |
| TREND · 무드 순서 이상 | 0144 함수 | `select public.photo_view_counts(now() - interval '30 days');` 로 직접 확인. 함수가 없으면 앱이 예전 방식으로 센다 |
| 홈 피드 중복 · 누락 | `fetchSeededFeedAt` | id 목록 1분 메모. 되돌리려면 RPC 호출로 복원(§5 #426) |
| 로그인이 풀린다 | proxy matcher | `/api/track` 제외(#429)는 세션에 영향 없음을 확인했지만, 의심되면 matcher 에서 빼 본다 |

### 9.3 직접 볼 SQL
```sql
-- 스냅샷 나이
select built_at at time zone 'Asia/Seoul', photo_count, now() - built_at as age from search_tag_snapshot;
-- 장소별 연결 수
select s.name, s.published, count(sp.*) filter (where not sp.excluded) as linked
from spots s left join spot_photos sp on sp.spot_id = s.id group by 1, 2 order by 3 desc;
-- 지역 분포
select region, count(*) from photos group by region order by 2 desc;
```

---

## 10. 남은 과제

| 과제 | 왜 | 상태 |
|---|---|---|
| **사후 확인** — 다음 날 Query Performance · API Gateway · DB CPU | 조치 효과를 숫자로 확인 | 대기 |
| 맥미니 `git pull` + `CRON_SECRET` 추가 | 06:00 `[5/5]` 활성(없어도 09:00 백업이 채움) | 대기 |
| **스냅샷이 멈췄던 원인** | 06:00 배치 로그(`scripts/embed/logs/`) — 원인이 남아 있으면 또 멈춘다 | 미확인 |
| 증설 후 컴퓨트 크기 확인 · 기록 | §7 | 미확인 |
| `search_logs` 404 | 장애 중 POST 404 159건 — 운영 DB 에 테이블이 없거나 API 노출 안 됨(0049 미적용 의심). 검색 기록이 안 쌓이고 있을 수 있다 | **미해결** |
| `getClaims()` 전환 | 페이지마다 Auth 확인 2번(proxy + `getCurrentUser`). 비대칭 JWT 서명 키여야 효과 — 대시보드 JWT Keys 확인 필요 | 보류 |
| 방문 기록 보관 정책 | `analytics_events` 가 지워지지 않고 계속 커진다(0122 작성 시점 6.4만 행 · 39MB) | 보류 |
| `feed_photos_seeded` 함수 삭제 | #426 이후 안 씀 | 보류 |
| Realtime WAL 감지 7% | 접속자 · 쓰기에 비례 | 관찰 |
| 장소 데이터 정리 | 키워드 오타 「선너뱌위」, 해방촌 신흥시장(비공개 · 연결 30) 공개 검토, 궁궐 네 곳 0~2장 | 운영 |

---

## 11. 교훈

- **인스턴스별 메모리 캐시 + 무거운 조회**는 트래픽이 아니라 **인스턴스 수**에 비례해 DB 를 친다. 서버리스에서 트래픽이 몰리면 둘이 같이 는다. 무거운 건 미리 계산해 저장하거나(스냅샷 · 연결 표 · DB 집계 함수) 공유 캐시로
- **앞에 `%` 가 붙은 `ilike`** 는 인덱스를 못 탄다. 요청 경로에 두지 않는다
- **조용히 낡는 데이터**(스냅샷)는 화면이 멀쩡해 보여서 늦게 안다 — 갱신 시각을 알림으로 본다
- **API 최대 행 수(1,000)** 는 `.limit(100000)` 을 조용히 자른다. 세는 일은 DB 에서
- 사이트가 죽었는지 **밖에서** 보는 감시가 있어야 한다(#421)

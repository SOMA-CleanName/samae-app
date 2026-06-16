# 16. 행동 분석 & Google Sheets 연동

고객 행동(페이지뷰·CTA 클릭·이탈률)을 자체 DB(`analytics_events`)에 전부 쌓고,
**핵심 이벤트만** Google Sheets 로 흘려보낸다. 광고는 카테고리별로 `utm_*` 파라미터를 붙여
`/c/<slug>` 로 랜딩시키면 유입이 추적된다.

## 수집 구조

```
브라우저 (AnalyticsTracker, 루트 레이아웃)
  ├─ 페이지뷰: 라우트 변경마다
  ├─ 클릭: 모든 a/button/[data-track] 전역 캡처(라벨·href)
  ├─ UTM/landing_path: 첫 진입 시 캡처해 세션 동안 유지
  └─ sendBeacon/fetch → POST /api/track
        ├─ DB analytics_events 적재 (전부, service-role)
        └─ 핵심 이벤트만 → SHEETS_WEBHOOK_URL (Apps Script) → 시트 append
```

- **핵심 이벤트** = `pageview` + `data-track="cta:..."` 로 표시한 클릭.
  - 새 CTA를 시트에 넣고 싶으면 그 버튼/링크에 `data-track="cta:이름"` 만 달면 됨.
  - 이미 표시된 것: `cta:photo`(갤러리 사진), `cta:inquiry`(예약·문의), `cta:signup_kakao`(가입).
- DB(어드민 `/admin/analytics`)에는 **모든** 클릭·페이지뷰가 쌓임(이탈률·인기 페이지·UTM 포함).

## 환경변수

```
SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/XXXX/exec
```
미설정이면 시트 전송은 건너뛰고 DB 수집만 동작한다.

## Google Apps Script (doPost)

1. 새 Google Sheet 생성 → 시트 이름 `Events`, 1행 헤더:
   `ts | event | path | label | target | referrer | landing_path | utm_source | utm_medium | utm_campaign | utm_content | utm_term | session_id | profile_id`
2. 확장 프로그램 → Apps Script 에 아래 붙여넣기:

```javascript
const SHEET_ID = '여기에_스프레드시트_ID';

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Events');
  const rows = (data.events || []).map(function (r) {
    return [
      r.ts, r.event, r.path, r.label, r.target, r.referrer, r.landing_path,
      r.utm_source, r.utm_medium, r.utm_campaign, r.utm_content, r.utm_term,
      r.session_id, r.profile_id,
    ];
  });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. 배포 → 새 배포 → 유형 "웹 앱" → 액세스 "모든 사용자" → URL 복사 → `SHEETS_WEBHOOK_URL` 에 등록.

## 전송 페이로드 (POST /api/track → webhook)

```json
{
  "events": [
    {
      "ts": "2026-06-16T...Z",
      "event": "pageview" | "click",
      "path": "/c/portrait",
      "label": "cta:inquiry",
      "target": "/inquiry?photographerId=...",
      "referrer": "/",
      "landing_path": "/c/portrait?utm_source=instagram&utm_campaign=portrait_jun",
      "utm_source": "instagram",
      "utm_medium": "paid",
      "utm_campaign": "portrait_jun",
      "utm_content": "",
      "utm_term": "",
      "session_id": "uuid",
      "profile_id": "uuid | ''"
    }
  ]
}
```

## 광고 운영 팁

- 카테고리별 광고는 `/c/<slug>?utm_source=...&utm_medium=paid&utm_campaign=<카테고리>_<월>` 형태로 랜딩.
- 어드민 `/admin/analytics` 에서 utm_source·utm_campaign 랭킹 + 이탈률로 광고 성과 비교.

# 15. 인증 이메일 — samae 브랜딩 템플릿 & 설정

회원가입 이메일 인증 메일을 Supabase 기본 문구가 아니라 **samae 브랜딩**으로 바꾸고,
링크 클릭 시 **우리 사이트(`/auth/confirm`)로 돌아와 로그인 유도**하도록 설정한다.

> 코드는 이미 준비됨: `src/app/auth/confirm/route.ts`(token_hash 검증 → `/login?verified=1`),
> `/signup`(가입+안내), `/login`(인증 완료 배너). 아래는 **Supabase 대시보드 작업**이다.

---

## 1) URL 설정 (필수)

**Authentication → URL Configuration**

- **Site URL**: 운영 도메인 (예: `https://samae.app`). 개발 중엔 `http://localhost:3000`.
- **Redirect URLs** 에 추가:
  - `http://localhost:3000/auth/confirm`
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/login`
  - 운영 도메인의 동일 경로들

이게 빠지면 `emailRedirectTo` / 인증 링크가 차단된다.

---

## 2) 이메일 인증 켜기

**Authentication → Sign In / Providers → Email → "Confirm email" ON**

- ON: 가입 후 확인 메일의 링크를 눌러야 가입 완료 → `/login?verified=1` 로 돌아와 로그인.
- OFF: 가입 즉시 로그인(코드가 알아서 분기 처리).

---

## 3) 메일 템플릿 (Confirm signup)

**Authentication → Emails → "Confirm signup"** 에서 아래로 교체.

링크는 `{{ .ConfirmationURL }}` 대신 **token_hash 방식**을 쓴다(다른 기기에서 열어도 동작).
`type=signup` 이며, `/auth/confirm` 라우트가 검증 후 `/login?verified=1` 로 보낸다.

### Subject (제목)

```
[samae] 이메일 인증을 완료해 주세요
```

### Message body (HTML)

```html
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"
  style="background:#fafafa;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
        style="max-width:440px;background:#ffffff;border:1px solid #e7e5e1;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:32px 32px 0;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:24px;color:#ff3d2e;font-weight:700;">samae</div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <h1 style="margin:0;font-size:20px;line-height:1.4;color:#0f0e0c;font-weight:700;">
              이메일 인증을 완료해 주세요
            </h1>
            <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#57534e;">
              samae 가입을 거의 마쳤어요. 아래 버튼을 눌러 이메일 인증을 완료하면,
              로그인 화면으로 이동해 바로 시작할 수 있어요.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 8px;">
            <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup"
              style="display:block;text-align:center;background:#0f0e0c;color:#ffffff;text-decoration:none;
              font-size:15px;font-weight:700;padding:14px 20px;border-radius:12px;">
              이메일 인증하고 시작하기
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 28px;">
            <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#8a857d;">
              버튼이 동작하지 않으면 아래 주소를 복사해 브라우저에 붙여넣으세요.<br>
              <span style="color:#57534e;word-break:break-all;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup</span>
            </p>
            <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#8a857d;">
              본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-size:11px;color:#8a857d;">© samae · 취향에 맞는 사진작가를 만나는 곳</p>
    </td>
  </tr>
</table>
```

> 같은 톤으로 "Magic Link", "Reset Password", "Change Email" 템플릿도 교체 가능
> (각 링크의 `type` 값만 `magiclink` / `recovery` / `email_change` 로 바꾸고 라우트는 동일).

---

## 4) 커스텀 SMTP — 운영 필수 (Resend 기준 단계별)

> ⚠️ **중요**: Supabase **내장 이메일은 시간당 수 통**으로 하드 제한된다(개발/테스트 전용).
> 그대로 배포하면 시간당 2~3명밖에 이메일 가입을 못 한다. 운영에선 커스텀 SMTP 가 **필수**.
> (카카오 등 OAuth 가입은 메일을 안 보내므로 이 제한과 무관하다.)

여기서는 가장 간단한 **Resend** 기준. SendGrid/Postmark/AWS SES 도 절차는 비슷하다.

### 4-1. Resend 가입 & 도메인 인증

1. https://resend.com 가입.
2. **Domains → Add Domain** 에 보낼 도메인 입력 (예: `samae.app`).
   - 발신 전용 서브도메인(`mail.samae.app` 등)을 권장하기도 함.
3. Resend 가 보여주는 **DNS 레코드(보통 3개)** 를 도메인 DNS(가비아/Cloudflare 등)에 추가:
   - **SPF** (TXT): `v=spf1 include:amazonses.com ~all` 류
   - **DKIM** (CNAME 또는 TXT): Resend 가 준 값 그대로
   - **DMARC** (TXT, 권장): `v=DMARC1; p=none;` 부터 시작
4. DNS 전파 후 Resend 에서 **Verified** 표시 확인 (수 분~수 시간).
5. **API Keys → Create API Key** 로 키 발급 (`re_...`). 한 번만 보이니 복사.

> 도메인이 아직 없다면: Resend 의 테스트 도메인(`onboarding@resend.dev`)은
> **본인 계정 이메일로만** 발송돼서 실유저 테스트엔 못 쓴다 → 도메인 인증 필요.

### 4-2. Supabase 에 SMTP 입력

**Authentication → Emails → SMTP Settings → Enable Custom SMTP** 켜고:

| 항목 | 값 |
|------|-----|
| Sender email | `no-reply@samae.app` (인증한 도메인) |
| Sender name | `samae` |
| Host | `smtp.resend.com` |
| Port | `465` (SSL) — 막히면 `587` |
| Username | `resend` |
| Password | 발급한 API 키 (`re_...`) |

저장 후 **Authentication → Emails → 템플릿에서 "Send test email"** 로 실제 수신 확인.

### 4-3. 발송 한도 올리기

커스텀 SMTP 연결 후 **Authentication → Rate Limits → "Rate limit for sending emails"**
를 트래픽에 맞게 상향 (내장 서비스의 시간당 수 통 제한에서 벗어남).
Resend 기준 무료도 월 3,000통/일 100통, 유료는 더 큼.

### 4-4. 발신자 표시

위처럼 Sender name `samae` + 인증 도메인 주소를 쓰면 받은편지함에
`samae <no-reply@samae.app>` 로 표시된다. SPF/DKIM 인증이 돼 있어야 스팸으로 안 빠진다.

---

## 5) 코드 쪽 보호 (이미 적용)

- 회원가입 안내 화면의 "확인 메일 다시 보내기"에 **60초 쿨다운** — 연타로 한도 깎는 것 방지.
- `signUp`/`resend` 의 `emailRedirectTo` = `/login?verified=1`.
- 다른 기기에서 열어도 되도록 `token_hash` 검증 라우트(`/auth/confirm`) 사용.

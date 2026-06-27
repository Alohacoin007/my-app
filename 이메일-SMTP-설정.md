# C6 — 이메일 deliverability 설정 (커스텀 SMTP) 런북

> **문제:** 가입 OTP가 Supabase **기본 발신자**로 나가서 (1) 스팸함으로 직행하고
> (2) **시간당 3~4통** 한도에 걸린다 → 손님이 인증코드를 못 받음 = **오픈 불가.**
>
> **해결:** 커스텀 SMTP(Resend 권장) 연결 + 도메인 **SPF/DKIM/DMARC** 인증.
> 이건 전부 **Supabase 대시보드 + DNS** 작업이라 Claude이 못 한다 — 아래를 네가 실행.
>
> - 프로젝트: `grxnbgtfnaayeluenvqh`
> - 발신 도메인: `alpexa-sports.com`
> - 제안 발신 주소: `no-reply@alpexa-sports.com`
>
> ⚠️ **코드 변경 없음.** signup의 `signInWithOtp`는 그대로 두면 된다 — SMTP를
> 연결하면 Supabase가 인증메일을 **자동으로** 그 SMTP로 보낸다.

---

## 1단계 — Resend 계정 + 도메인 인증

1. <https://resend.com> 가입 (무료 티어로 시작 가능).
2. **Domains → Add Domain** → `alpexa-sports.com` 입력.
3. Resend가 **DNS 레코드 3종**을 보여준다 (도메인마다 값이 다르니 화면 값 그대로 사용):
   - **MX** — `send` 서브도메인 (바운스/피드백용)
   - **SPF (TXT)** — `send` 서브도메인, 보통 `v=spf1 include:amazonses.com ~all`
   - **DKIM (TXT)** — `resend._domainkey` 에 공개키
4. 이 레코드들을 **도메인 DNS 관리화면**(가비아/Cloudflare/Route53 등 너가 alpexa-sports.com 산 곳)에 추가.
5. Resend로 돌아와 **Verify** → 전부 초록(Verified) 될 때까지 대기 (보통 몇 분~몇 시간).

## 2단계 — DMARC 레코드 추가 (스팸 점수 ↓, 권장)

DNS에 TXT 레코드 하나 더:

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc.alpexa-sports.com` | `v=DMARC1; p=none; rua=mailto:dmarc@alpexa-sports.com; fo=1` |

> `p=none`로 시작(모니터링만) → 며칠 리포트 보고 문제 없으면 `p=quarantine`로 강화.

## 3단계 — Resend API 키 발급

Resend **API Keys → Create API Key** (권한 Sending). 값은 `re_...` 형태.
**한 번만 보이니** 안전한 곳에 복사.

## 4단계 — Supabase에 SMTP 연결

Supabase 대시보드 → **Project Settings → Authentication → SMTP Settings**
→ **Enable Custom SMTP** 켜고:

| 항목 | 값 |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) — 막히면 `587` (STARTTLS) |
| Username | `resend` |
| Password | `re_...` (3단계 API 키) |
| Sender email | `no-reply@alpexa-sports.com` |
| Sender name | `Alpexa` |

**Save.** (Sender email은 **반드시 1단계에서 인증한 도메인**의 주소여야 함.)

## 5단계 — 발신 한도(rate limit) 올리기

Supabase → **Authentication → Rate Limits** → **Email sent** 항목.
기본은 시간당 ~30 정도. 커스텀 SMTP를 붙이면 올릴 수 있으니 예상 가입량에 맞게
(예: 시간당 100~200) 상향. Resend 무료 티어는 일 3,000/월 한도이니 유료 플랜은
트래픽 보고 결정.

## 6단계 — OTP 이메일 템플릿 다듬기 (선택, deliverability ↑)

Supabase → **Authentication → Email Templates → Magic Link** (OTP도 이 템플릿 사용).
권장:

- **Subject:** `Alpexa 인증 코드: {{ .Token }}`  (제목에 코드 → 도착 즉시 확인)
- **Body:** 회사명/로고 + 코드 `{{ .Token }}` + "10분 내 만료" 안내 + 푸터에
  실제 회사명·주소·"문의 support@alpexa-sports.com". (빈약한 본문/이미지 한 장은
  스팸 점수↑ — 텍스트와 균형 있게.)

> 변수: 6자리 코드는 `{{ .Token }}`. 매직링크 방식이면 `{{ .ConfirmationURL }}`.
> 현재 signup은 `signInWithOtp`(코드 방식)이라 `{{ .Token }}`가 맞다.

---

## ✅ 검증 (보내고 눈으로 확인 — 추측 금지)

1. **mail-tester:** <https://www.mail-tester.com> 가서 표시된 임시주소로
   가입 OTP를 한 번 보내고(그 주소로 signInWithOtp), **10/10 점** 확인.
   SPF/DKIM/DMARC가 각각 pass여야 한다.
2. **실제 받은편지함:** Gmail/Outlook/네이버 각각 새 주소로 가입 테스트 →
   **받은편지함(스팸 아님)** 도착 확인.
3. **헤더 확인:** Gmail "원본 보기"에서
   `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS` 셋 다 PASS인지.
4. **연속 발송:** 5~6통 연속 가입 → 기본 한도(시간당 3~4통) 에러 안 나는지
   (5단계 상향이 먹었는지).

이 4개 다 통과해야 C6 "완료". 하나라도 빨강이면 해당 단계(DNS 전파 대기/오타) 재확인.

---

## 대안 제공자 (Resend 대신)

같은 흐름(도메인 인증 + SMTP 연결)으로 교체 가능:

| 제공자 | SMTP Host | 비고 |
|---|---|---|
| **Resend** (권장) | `smtp.resend.com` | 셋업 간단, 개발자 친화 |
| Postmark | `smtp.postmarkapp.com` | 트랜잭션 메일 도달률 최상급 |
| AWS SES | `email-smtp.<region>.amazonaws.com` | 대량·최저가, 셋업 복잡 |
| SendGrid | `smtp.sendgrid.net` | 무료 100/일 |

> 어느 걸 써도 **반드시 도메인 SPF/DKIM 인증**을 해야 스팸을 면한다. 인증 없이
> SMTP만 붙이면 여전히 스팸행.

# 📧 Alpexa 일일 리포트 이메일 — 세팅 가이드 (초보자용)

매일 아침 정산 리포트를 이메일로 자동으로 받는 설정입니다. **천천히 순서대로** 따라오세요.

---

## 1단계 — Gmail "앱 비밀번호" 만들기 (제일 중요!)

> ⚠️ **일반 Gmail 로그인 비밀번호는 안 됩니다.** 보안상 프로그램이 메일을 보내려면 **"앱 비밀번호"**(16자리)라는 별도 비번이 필요해요.

1. 발신용 Gmail 계정에 **2단계 인증(2-Step Verification)** 을 먼저 켜야 합니다.
   - https://myaccount.google.com/security → **2단계 인증** → 켜기
   - (2단계 인증이 꺼져 있으면 앱 비밀번호 메뉴가 안 보여요)
2. https://myaccount.google.com/apppasswords 접속
3. 앱 이름에 `Alpexa 리포트` 입력 → **만들기**
4. 화면에 뜨는 **16자리 비밀번호**(예: `abcd efgh ijkl mnop`)를 복사 → 이게 `EMAIL_PASS` 입니다.
   - 공백은 있어도 되고 지워도 됩니다.
   - **이 창을 닫으면 다시 못 봐요** — 바로 아래 `.env`에 붙여넣으세요.

---

## 2단계 — `.env` 파일 만들기

1. 프로젝트 폴더에서 `.env.example` 을 복사해 `.env` 를 만듭니다:
   ```bash
   cp .env.example .env
   ```
2. `.env` 파일을 열어 4가지 값을 채웁니다:
   ```
   EMAIL_HOST=smtp.gmail.com
   EMAIL_USER=보내는주소@gmail.com          # 리포트를 보내는 Gmail
   EMAIL_PASS=abcd efgh ijkl mnop            # 위에서 만든 16자리 앱 비밀번호
   EMAIL_TO=내개인이메일@example.com          # 리포트를 받아볼 내 메일 (여러 명은 쉼표로)
   ```

> 🔒 **`.env` 는 절대 GitHub에 안 올라갑니다** (`.gitignore`에 등록됨). 비밀번호가 소스코드에 노출될 일이 없어요.

---

## 3단계 — 테스트 (메일 안 보내고 미리보기)

먼저 **실제 발송 없이** 리포트가 잘 만들어지는지 확인:
```bash
node tests/alpexa-daily-report.test.js     # 리포트 데이터 생성
node reports/send-daily-report.js --dry-run # 메일 대신 HTML 미리보기 파일 생성
```
→ `reports/preview-....html` 파일이 생기면 그걸 브라우저로 열어 리포트 모양을 확인하세요.

**진짜로 나에게 한 통 보내보기** (`.env` 다 채운 뒤):
```bash
node reports/send-daily-report.js
```
→ `✅ 리포트 이메일 발송 완료` 가 뜨고 `EMAIL_TO` 메일함에 리포트가 도착하면 성공! 🎉

---

## 4단계 — 매일 아침 자동 발송 (스케줄)

### 방법 A — GitHub Actions (서버 없이, 추천)
1. GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret**
   에서 `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_TO` 4개를 등록.
2. `.github/workflows/daily-report-email.yml` 의 `schedule` 주석을 풀면 매일 자동 실행됩니다.
   (지금은 안전하게 **수동 실행(manual)** 으로만 설정돼 있어요.)

### 방법 B — 서버 crontab (직접 서버가 있으면)
```bash
crontab -e
# 매일 아침 8시(서버 시간)에 실행:
0 8 * * *  cd /path/to/my-app && node reports/send-daily-report.js >> reports/email.log 2>&1
```

---

## ❓ 자주 막히는 곳

| 증상 | 원인 / 해결 |
|---|---|
| `Invalid login` / `535` | 앱 비밀번호가 아니라 일반 비번을 넣음 → 1단계 다시 |
| 앱 비밀번호 메뉴가 안 보임 | 2단계 인증이 꺼져 있음 → 먼저 켜기 |
| `이메일 설정 누락` | `.env` 값이 비었거나 `.env` 위치가 프로젝트 루트가 아님 |
| 메일이 스팸함에 감 | 처음 몇 번은 스팸으로 갈 수 있어요 → "스팸 아님" 표시 |
| Gmail 말고 다른 메일 | `EMAIL_HOST` 를 해당 서버로 (네이버: `smtp.naver.com`, 아웃룩: `smtp.office365.com`) |

> ⚠️ **참고 (정직하게):** 지금 파이프라인은 **리포트 생성 → HTML → 발송**까지 완성돼 있고, 보내는 데이터는 시뮬레이션/최근 생성된 리포트예요. **실제 운영 DB 숫자로 보내려면** `reports/send-daily-report.js` 의 `loadReport()` 를 Supabase 실데이터 조회로 연결하는 마지막 한 단계가 필요합니다 (원하면 도와드려요).

# Alpexa Sports — 안드로이드 APK(TWA) 배포 가이드

alpexa-sports.com PWA를 감싼 **정식 안드로이드 앱(.apk/.aab)** 을 만들어 **사이트에서 직접 다운로드**하게 한다.
Play 스토어를 안 거치므로 도박정책·라이선스 국가제한을 안 받고, **targetSdk 최신**으로 빌드하면
"오래된 안드로이드 버전" 경고도 안 뜬다. (아이폰은 APK 불가 → 웹/홈화면 추가로.)

준비물: 우리 `manifest.json` + 아이콘(icon-512·maskable) — **이미 있음.**

---

## 1) APK 만들기 — PWABuilder (제일 쉬움, 무료)

1. **https://www.pwabuilder.com** 접속 → URL에 `https://alpexa-sports.com/login.html` 입력 → Start.
2. 점수 나오면 **Package For Stores → Android** 선택.
3. 옵션 확인:
   - Package ID: **`com.alpexasports.app`**  (assetlinks.json과 반드시 동일)
   - App name: **Alpexa Sports** / Launcher: **Alpexa**
   - Start URL: **/login.html**
   - Signing key: **"Create new"** (PWABuilder가 키 생성) → **키파일(.keystore)과 비밀번호를 안전하게 보관!** (분실 시 업데이트 불가)
4. **Generate → zip 다운로드.** 안에:
   - `app-release-signed.apk`  ← 배포용
   - `assetlinks.json`  ← **여기 SHA-256 지문이 들어있음**
   - 서명 키(.keystore), 비밀번호

> Bubblewrap CLI로도 가능: `npm i -g @bubblewrap/cli` → `bubblewrap init --manifest https://alpexa-sports.com/manifest.json` (레포의 `twa-manifest.json` 참고) → `bubblewrap build`.

---

## 2) 도메인 연결 — assetlinks.json (전체화면 되게)

1. PWABuilder zip 안 `assetlinks.json`의 **sha256_cert_fingerprints** 값을 복사.
2. 레포 **`.well-known/assetlinks.json`** 의 `REPLACE_WITH_YOUR_SIGNING_KEY_SHA256_FINGERPRINT` 를 그 값으로 교체.
3. 커밋·푸시 → `https://alpexa-sports.com/.well-known/assetlinks.json` 에서 열리는지 확인.

> 이게 맞아야 앱이 **주소창 없이 전체화면**으로 열린다. 지문이 틀리면 URL 바가 보임(작동은 함).

---

## 3) 앱 파일 올리고 다운로드 버튼 달기

1. `app-release-signed.apk` 를 사이트에 올림 → 예: `https://alpexa-sports.com/alpexa.apk`
   (레포 루트에 `alpexa.apk` 커밋하거나 릴리스에 첨부)
2. 로그인/랜딩에 **"안드로이드 앱 다운로드"** 버튼:
   ```html
   <a href="/alpexa.apk" download>📥 안드로이드 앱 다운로드</a>
   ```
3. 사용설명 가이드도 "안드로이드: 앱 다운로드 → 설치" 로 안내(원하면 Claude이 반영).

---

## 4) 고객 설치 흐름
다운로드 → apk 누름 → **"이 출처 설치 허용"** 한 번 승인(정상) → 설치 → 전체화면 앱.
(첫 승인만 필요, 경고 아님. targetSdk 최신이라 "오래된 안드로이드" 경고 없음.)

## 5) 업데이트
TWA는 웹을 감싼 것 → **콘텐츠는 항상 최신**(웹 반영). 앱 껍데기(아이콘·이름) 바꿀 때만
버전 올려 새 apk 재배포. 그땐 **같은 서명 키**로 빌드해야 기존 사용자가 업데이트 가능.

---

## 체크리스트
- [ ] PWABuilder로 Android 패키지 생성 (Package ID = `com.alpexasports.app`)
- [ ] 서명 키(.keystore)+비밀번호 안전 보관 (분실=업데이트 영영 불가)
- [ ] `.well-known/assetlinks.json` 에 SHA-256 지문 넣고 배포
- [ ] `alpexa.apk` 사이트에 올림 + 다운로드 버튼
- [ ] 실제 안드로이드폰서 다운로드→설치→전체화면 확인

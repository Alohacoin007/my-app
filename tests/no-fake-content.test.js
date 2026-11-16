#!/usr/bin/env node
// Alpexa — 고객에게 가짜·빈 껍데기를 보여주지 않는다 (2026-11-15 앱 분석 1단계 #1·#6, 사장님 "1단계로 해")
// ============================================================================
// 발견(코드에서 직접 확인):
//  스포츠 모바일 — 실제(ESPN) 경기 카드·실황 화면의 "PLAY-BY-PLAY · LIVE" 가 종목별 문구 목록에서
//    **랜덤으로 뽑은** 가짜 실황이었다 (genericPlay). 실제 경기에 없는 플레이를 보여준 것.
//  크립토 모바일 —
//    · 지정가/스탑 주문이 폰(localStorage)에만 저장되고 아무도 체결하지 않는데 "가격에 도달하면 체결됩니다" 안내.
//    · 송금 영수증의 Tx hash·Reference 가 Math.random() 으로 만든 값 (내부 이체엔 체인 해시가 없다).
//    · 2FA·생체인증·자동잠금 토글을 읽는 코드가 없음 (출금 인증코드는 토글과 무관하게 서버가 강제).
//    · 세금 서류(지어낸 양식 + "다운로드" 토스트) · 내 데이터 다운로드("Requested" 토스트) · KYC "Start verification"(토스트).
// 원칙: 안 되는 기능은 **되는 척하지 않는다**. 서버 기능이 생기면 그때 다시 켠다.
// 정적 핀 · 네트워크 0 · 돈 0 (시장가 매매·이체 RPC 경로는 한 줄도 안 건드림).
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };

// ── 스포츠 모바일 ─────────────────────────────────────────────────────────────
const sp = rd('sports-live.html');
ok('스포츠: 랜덤 실황 생성기(genericPlay) 없음', !/genericPlay/.test(sp));
ok('스포츠: 실제 경기(g.real)에 lastPlay 를 지어내 넣는 루프 없음', !/GAMES\.filter\(g=>g\.live && g\.real\)\.forEach/.test(sp));
ok('스포츠: 실황 화면의 PLAY-BY-PLAY 구역은 실제 플레이가 있을 때만 그린다',
   /\(g\._feed&&g\._feed\.length\?'<div class="lcov-lbl">PLAY-BY-PLAY/.test(sp));

// ── 크립토 모바일 (소스 + 배포 컴파일본 둘 다) ──────────────────────────────────
const jsx = rd('src/crypto-live-app.jsx'), bin = rd('vendor/crypto-live-compiled.js');
for (const [nm, s] of [['소스', jsx], ['컴파일본', bin]]) {
  ok(`크립토 ${nm}: 주문 유형 = 시장가만 (ORDER_TYPES) — Limit/Stop 탭 없음`,
     /ORDER_TYPES\s*=\s*\[['"]Market['"]\]/.test(s) && !/\[['"]Market['"],\s*['"]Limit['"],\s*['"]Stop['"]\]/.test(s));
  ok(`크립토 ${nm}: 송금 영수증에 랜덤 Tx hash·Reference 없음`,
     !/Tx hash/.test(s) && !/['"]ALPX-['"]\s*\+\s*Math\.random/.test(s) && !/refData/.test(s));
  ok(`크립토 ${nm}: 동작 안 하는 보안 토글(2FA·생체인증·자동잠금) 없음`,
     !/Two-factor authentication/.test(s) && !/Biometric unlock/.test(s) && !/Auto-lock after 5 min/.test(s) &&
     !/alpexa\.sec\.(twofa|bio|autoLock)/.test(s));
  ok(`크립토 ${nm}: 세금 서류·내 데이터 다운로드 메뉴 없음`,
     !/go\(['"]personal-tax['"]\)/.test(s) && !/go\(['"]security-download['"]\)/.test(s));
  ok(`크립토 ${nm}: KYC "Start verification" 가짜 버튼 없음`, !/Start verification/.test(s));
  ok(`크립토 ${nm}: 도움말이 지정가·스탑 주문을 지원한다고 말하지 않는다`,
     !/Stop-limit orders are supported/.test(s) && !/unfilled limit order/.test(s));
}
// 시장가 매매 경로는 그대로 (돈 코드 무변경 확인용 닻)
ok('크립토 소스: 시장가 = 서버 crypto_trade RPC 경로 그대로', /Market orders settle on the SERVER \(crypto_trade RPC\)/.test(jsx));

console.log(`\n${fail ? '🔴' : '🟢'} no-fake-content — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

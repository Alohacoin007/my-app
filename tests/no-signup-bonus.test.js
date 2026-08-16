#!/usr/bin/env node
// MONEY — 신규 가입 보너스 폐지 (사장님 2026-08-16 "신규 가입자 보너스 없애줘", 범위=전부·기존고객 유지).
//
// 없애는 것 (자동 지급 3종):
//   · Sports $100 현금   · FX $100 현금   · Crypto 100 ALPXS 1년 락 스테이크
// 남기는 것: 추천코드(redeem_referral) — 코드를 직접 입력해야 받는 별개 프로그램. 지시 범위 밖.
// 기존 고객: 회수하지 않는다. accounts.bonus 컬럼과 그 값(=100)은 그대로 두어 **기존 계정의
//   $100 은 계속 출금 불가**로 묶인다. 신규만 0.
//
// 불변식: 신규 가입 계정의 오프닝 = 0. `balance == bonus(0) + Σledger + Σsettlements` 유지,
//        출금가능 = balance − 0 = 실제 입금액뿐.
//
// ⚠️ 이 핀이 특히 지키는 두 가지 (둘 다 "조용히 되살아나는" 형태):
//  ① `force_opening_balance` 가 **두 파일에 중복 정의**돼 있다(welcome_bonus.sql · withdraw_guard.sql).
//     한쪽만 고치면 나중에 다른 쪽을 재실행하는 순간 보너스가 부활한다 — 둘 다 0이어야 한다.
//  ② withdraw_guard.sql 의 백필 `update accounts set bonus=100 where ... coalesce(bonus,0)=0` 은
//     이제 **신규(보너스 0) 계정을 정확히 골라** bonus=100 으로 만든다 → 잔고 0인데 비출금액 100
//     = 나중에 입금해도 출금가능이 깎인다. 재실행 시 터지는 지뢰라 파일에서 제거돼야 한다.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── ① force_opening_balance 는 어느 파일에 있든 0 만 준다 ──
const FILES = ['supabase/sql/welcome_bonus.sql', 'supabase/sql/withdraw_guard.sql'];
let defs = 0;
for (const f of FILES) {
  const src = read(f);
  const m = src.match(/create or replace function public\.force_opening_balance\(\)[\s\S]*?\$\$;/i);
  if (!m) continue;
  defs++;
  const body = m[0];
  // `when 'sports' then 100` 류가 하나라도 남아 있으면 보너스가 살아 있다
  const gives = body.match(/then\s+(\d+(?:\.\d+)?)/g) || [];
  const nonZero = gives.filter((g) => parseFloat(g.replace(/then\s+/, '')) !== 0);
  if (nonZero.length) bad(`${f}: force_opening_balance 가 아직 돈을 준다 (${nonZero.join(', ')}) — 신규 오프닝은 전부 0`);
  if (/new\.bonus\s*:=[\s\S]{0,80}?then\s+[1-9]/.test(body))
    bad(`${f}: force_opening_balance 가 신규 계정에 bonus 를 붙인다 — 신규는 bonus 0`);
}
if (defs === 0) bad('force_opening_balance 정의를 두 파일 어디서도 못 찾았다 (이름이 바뀌었나?)');

// ── ② 크립토 웰컴 스테이크 자동 생성이 꺼져 있어야 한다 ──
const wb = read('supabase/sql/welcome_bonus.sql');
if (/create trigger trg_seed_crypto_welcome/i.test(wb))
  bad('trg_seed_crypto_welcome 트리거가 아직 생성된다 — 가입 시 100 ALPXS 스테이크가 계속 꽂힌다');
if (!/drop trigger if exists trg_seed_crypto_welcome/i.test(wb))
  bad('welcome_bonus.sql 이 trg_seed_crypto_welcome 을 **명시적으로 drop** 해야 한다 (이미 배포된 트리거를 내려야 실제로 멈춘다)');
if (/insert into public\.crypto_stakes[\s\S]{0,200}'ALPXS',\s*100/i.test(wb))
  bad('welcome_bonus.sql 에 100 ALPXS 스테이크 insert 가 남아 있다');

// ── ③ 재실행 지뢰: bonus=100 백필 제거 ──
const wg = read('supabase/sql/withdraw_guard.sql');
if (/update public\.accounts set bonus\s*=\s*100/i.test(wg))
  bad('withdraw_guard.sql 의 bonus=100 백필이 남아 있다 — 재실행하면 **신규 계정**(bonus 0)을 골라 100 을 붙인다');

// ── ④ 클라: 가입 시 돈을 심지 않는다 ──
const su = read('signup.html');
const ins = (su.match(/rows\s*=\s*\[\{player_id[^\]]*\]/) || [''])[0];
if (/balance:\s*[1-9]/.test(ins))
  bad('signup.html 이 아직 0 이 아닌 balance 로 accounts 를 insert 한다 (트리거가 덮더라도 의도를 코드에 남기면 안 된다)');

// ── ⑤ 고객에게 "가입하면 준다"고 광고하지 않는다 (없는 걸 약속하면 안 된다) ──
const CLAIMS = [
  ['src/crypto-live-app.jsx', /New users receive 100 ALPXS as a welcome bonus/i, '크립토 FAQ 의 "신규 가입자 100 ALPXS 지급" 문구'],
  ['vendor/crypto-live-compiled.js', /New users receive 100 ALPXS as a welcome bonus/i, '사전컴파일 산출물에 남은 같은 문구 (precompile 안 돌림)'],
];
for (const [f, re, label] of CLAIMS) if (re.test(read(f))) bad(`${label} — 자동 지급을 없앴으므로 삭제해야 한다 (${f})`);

// ── ⑥ 추천코드 프로그램은 **건드리지 않았는지** (범위 밖을 지운 것도 결함) ──
if (!/create or replace function public\.redeem_referral/i.test(read('supabase/sql/redeem_referral.sql')))
  bad('추천코드(redeem_referral)까지 지웠다 — 지시 범위는 **가입 자동 보너스**뿐이다');

// ── ⑦ 기존 고객 보호: bonus 컬럼과 출금 가드는 그대로 살아 있어야 한다 ──
if (!/add column if not exists bonus/i.test(wg))
  bad('accounts.bonus 컬럼 정의가 사라졌다 — 기존 고객의 비출금 $100 이 풀려 출금 가능해진다');
if (!/balance,0\)\s*-\s*coalesce\(v_acct\.bonus,0\)/.test(wg))
  bad('withdrawable_for 의 (balance − bonus) 규칙이 사라졌다 — 기존 고객 웰컴머니가 출금 가능해진다');

if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log('🟢 PASS: 신규 가입 오프닝 = 0 (현금·ALPXS 스테이크 전부) · 재실행 백필 지뢰 제거 · 광고 문구 삭제 · 추천코드와 기존 고객 보호는 그대로.');
